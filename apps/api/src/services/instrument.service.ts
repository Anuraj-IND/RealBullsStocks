import { Prisma, type Asset, type Instrument } from "@realbulls/db";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { badRequest, notFound } from "../lib/errors.js";
import { parseCsv } from "../lib/csv.js";
import { publishRegistry } from "./market.service.js";

const SYNC_KEY = "instruments:lastSync";
const SYNC_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DAILY_MS = 24 * 60 * 60 * 1000;
const KITE_INSTRUMENTS_URL = "https://api.kite.trade/instruments";

const INDEX_UNDERLYINGS = new Set([
  "NIFTY",
  "NIFTY 50",
  "BANKNIFTY",
  "NIFTY BANK",
  "FINNIFTY",
  "NIFTY FIN SERVICE",
  "MIDCPNIFTY",
  "NIFTY MIDCAP SELECT",
  "NIFTYNXT50",
  "NIFTY NEXT 50",
  "NIFTYIT",
  "NIFTY IT",
  "NIFTYINFRA",
  "NIFTY INFRA",
  "NIFTYPHARMA",
  "NIFTY PHARMA",
  "NIFTYFMCG",
  "NIFTY FMCG",
  "NIFTYAUTO",
  "NIFTY AUTO",
  "NIFTYMETAL",
  "NIFTY METAL",
  "NIFTYREALTY",
  "NIFTY REALTY",
  "NIFTYENERGY",
  "NIFTY ENERGY",
  "NIFTYPSUBANK",
  "NIFTY PSU BANK",
  "NIFTYPVTBANK",
  "NIFTY PVT BANK",
  "NIFTYDIVOPPS50",
  "NIFTY DIV OPPS 50",
  "SENSEX",
  "SENSEX50",
  "BANKEX",
]);

const FNO_TYPES = new Set(["FUT", "CE", "PE"]);

function isIndexUnderlying(name: string): boolean {
  return INDEX_UNDERLYINGS.has(name.trim().toUpperCase());
}

function deriveSegment(name: string, instrumentType: string): string {
  const index = isIndexUnderlying(name);
  if (instrumentType === "FUT") return index ? "INDEX_FUTURES" : "STOCK_FUTURES";
  return index ? "INDEX_OPTIONS" : "STOCK_OPTIONS";
}

function parseExpiry(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchCsv(exchange: string): Promise<string> {
  const res = await fetch(`${KITE_INSTRUMENTS_URL}/${encodeURIComponent(exchange)}`, {
    headers: { "User-Agent": "realbulls-instrument-sync/1.0" },
  });
  if (!res.ok) throw new Error(`instrument download failed for ${exchange}: ${res.status}`);
  return res.text();
}

async function syncExchange(exchange: string): Promise<number> {
  const csv = await fetchCsv(exchange);
  const rows = parseCsv(csv);
  if (rows.length < 2) return 0;

  const header = (rows[0] ?? []).map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const iToken = col("instrument_token");
  const iExchangeToken = col("exchange_token");
  const iSymbol = col("tradingsymbol");
  const iName = col("name");
  const iExpiry = col("expiry");
  const iStrike = col("strike");
  const iTick = col("tick_size");
  const iLot = col("lot_size");
  const iType = col("instrument_type");
  const iLast = col("last_price");
  const iSegment = col("segment");
  const iExchange = col("exchange");

  if (iToken < 0 || iSymbol < 0 || iType < 0) {
    throw badRequest(`Unexpected instrument CSV header for ${exchange}`);
  }

  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  const records: Prisma.InstrumentCreateManyInput[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const token = row[iToken]?.trim();
    const tradingsymbol = row[iSymbol]?.trim();
    const instrumentType = row[iType]?.trim().toUpperCase();
    if (!token || !tradingsymbol || !instrumentType || !FNO_TYPES.has(instrumentType)) continue;

    const expiry = parseExpiry(row[iExpiry]?.trim() ?? "");
    if (expiry && expiry.getTime() < cutoff) continue;

    const name = (iName >= 0 ? row[iName]?.trim() : "") || tradingsymbol;
    const strikeRaw = iStrike >= 0 ? Number(row[iStrike]) : 0;
    const tickRaw = iTick >= 0 ? Number(row[iTick]) : 0.05;
    const lotRaw = iLot >= 0 ? Number(row[iLot]) : 1;
    const lastRaw = iLast >= 0 ? Number(row[iLast]) : 0;

    records.push({
      instrumentToken: token,
      exchangeToken: iExchangeToken >= 0 ? row[iExchangeToken]?.trim() ?? "" : "",
      tradingsymbol,
      name,
      expiry,
      strike: Number.isFinite(strikeRaw) ? strikeRaw : 0,
      tickSize: Number.isFinite(tickRaw) && tickRaw > 0 ? tickRaw : 0.05,
      lotSize: Number.isFinite(lotRaw) && lotRaw > 0 ? Math.round(lotRaw) : 1,
      instrumentType,
      segment: (iSegment >= 0 ? row[iSegment]?.trim() : "") || deriveSegment(name, instrumentType),
      exchange: (iExchange >= 0 ? row[iExchange]?.trim() : "") || exchange,
      lastPrice: Number.isFinite(lastRaw) ? lastRaw : 0,
    });
  }

  await prisma.instrument.deleteMany({ where: { exchange } });
  for (let i = 0; i < records.length; i += 2000) {
    await prisma.instrument.createMany({ data: records.slice(i, i + 2000), skipDuplicates: true });
  }
  return records.length;
}

export async function syncInstruments(exchanges: string[] = ["NFO", "BFO"]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const exchange of exchanges) {
    result[exchange] = await syncExchange(exchange);
  }
  await redis.set(SYNC_KEY, String(Date.now()));
  return result;
}

export async function loadInstrumentsIfStale(): Promise<void> {
  const raw = await redis.get(SYNC_KEY);
  const last = raw ? Number(raw) : 0;
  if (last && Date.now() - last < SYNC_MAX_AGE_MS) return;
  await syncInstruments();
}

let timer: NodeJS.Timeout | null = null;

export function startInstrumentSync(): void {
  if (timer) return;
  void loadInstrumentsIfStale().catch((err) => console.error("[instruments] initial sync failed", err));
  timer = setInterval(() => {
    void syncInstruments().catch((err) => console.error("[instruments] sync failed", err));
  }, DAILY_MS);
  timer.unref?.();
}

export interface InstrumentSearchParams {
  q?: string;
  exchange?: string[];
  type?: string;
  limit?: number;
}

export function instrumentDto(i: Instrument) {
  const type = i.instrumentType;
  return {
    instrumentToken: i.instrumentToken,
    tradingsymbol: i.tradingsymbol,
    name: i.name,
    underlying: i.name,
    expiry: i.expiry ? i.expiry.toISOString().slice(0, 10) : null,
    strike: Number(i.strike),
    tickSize: Number(i.tickSize),
    lotSize: i.lotSize,
    instrumentType: type,
    optionType: type === "CE" || type === "PE" ? type : null,
    segment: i.segment,
    exchange: i.exchange,
    lastPrice: Number(i.lastPrice),
    assetClass: isIndexUnderlying(i.name) ? "INDEX" : "STOCK",
  };
}

const SEARCH_ORDER: Prisma.InstrumentOrderByWithRelationInput[] = [
  { expiry: "asc" },
  { strike: "asc" },
  { name: "asc" },
  { instrumentType: "asc" },
];

export async function searchInstruments(params: InstrumentSearchParams) {
  const q = (params.q ?? "").trim();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const exchanges = params.exchange?.length ? params.exchange : ["NFO", "BFO"];
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const cutoff = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));

  const base: Prisma.InstrumentWhereInput[] = [
    { exchange: { in: exchanges } },
    { OR: [{ expiry: null }, { expiry: { gte: cutoff } }] },
  ];
  if (params.type) {
    const types = params.type
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (types.length === 1) base.push({ instrumentType: types[0] });
    else if (types.length > 1) base.push({ instrumentType: { in: types } });
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    const rows = await prisma.instrument.findMany({ where: { AND: base }, orderBy: SEARCH_ORDER, take: limit });
    return rows.map(instrumentDto);
  }

  const tokenFilters: Prisma.InstrumentWhereInput[] = tokens.map((tok) => {
    const numeric = Number(tok.replace(/,/g, ""));
    const ors: Prisma.InstrumentWhereInput[] = [
      { tradingsymbol: { contains: tok, mode: "insensitive" } },
      { name: { contains: tok, mode: "insensitive" } },
    ];
    if (Number.isFinite(numeric) && numeric > 0) ors.push({ strike: numeric });
    return { OR: ors };
  });

  const anchor = tokens[0]!;
  const phases: Prisma.InstrumentWhereInput[] = [
    { name: { equals: anchor, mode: "insensitive" } },
    {
      OR: [
        { tradingsymbol: { startsWith: anchor, mode: "insensitive" } },
        { name: { startsWith: anchor, mode: "insensitive" } },
      ],
    },
  ];

  const out: { row: Instrument; phase: number }[] = [];
  const seen = new Set<string>();
  const collect = async (phase: number, extra?: Prisma.InstrumentWhereInput) => {
    const rows = await prisma.instrument.findMany({
      where: { AND: [...base, ...tokenFilters, ...(extra ? [extra] : [])] },
      orderBy: SEARCH_ORDER,
      take: limit * 3,
    });
    for (const row of rows) {
      if (seen.has(row.instrumentToken)) continue;
      seen.add(row.instrumentToken);
      out.push({ row, phase });
    }
  };

  for (let i = 0; i < phases.length; i++) await collect(i, phases[i]);
  await collect(phases.length);

  const expiryTs = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
  out.sort(
    (a, b) =>
      a.phase - b.phase ||
      instrumentKindRank(a.row.instrumentType) - instrumentKindRank(b.row.instrumentType) ||
      expiryTs(a.row.expiry) - expiryTs(b.row.expiry) ||
      underlyingRank(a.row.name) - underlyingRank(b.row.name) ||
      a.row.name.localeCompare(b.row.name) ||
      Number(a.row.strike) - Number(b.row.strike) ||
      a.row.instrumentType.localeCompare(b.row.instrumentType),
  );

  return out.slice(0, limit).map(({ row }) => instrumentDto(row));
}

const UNDERLYING_PRIORITY: Record<string, number> = {
  NIFTY: 0,
  BANKNIFTY: 1,
  FINNIFTY: 2,
  SENSEX: 3,
  MIDCPNIFTY: 4,
  NIFTYNXT50: 5,
  SENSEX50: 6,
};

function underlyingRank(name: string): number {
  return UNDERLYING_PRIORITY[name.toUpperCase()] ?? 9;
}

function instrumentKindRank(instrumentType: string): number {
  const t = instrumentType.toUpperCase();
  if (t === "FUT") return 1;
  if (t === "CE" || t === "PE") return 2;
  return 0;
}

const UNDERLYING_ALIASES: Record<string, string> = {
  NIFTY: "NIFTY50",
  "NIFTY 50": "NIFTY50",
  "NIFTY BANK": "BANKNIFTY",
  BANKNIFTY: "BANKNIFTY",
  "NIFTY FIN SERVICE": "FINNIFTY",
  FINNIFTY: "FINNIFTY",
  SENSEX: "SENSEX",
};

function underlyingSymbol(name: string): string {
  return UNDERLYING_ALIASES[name.toUpperCase()] ?? name;
}

function friendlyName(i: Instrument): string {
  const strike = Number(i.strike);
  if (i.instrumentType === "FUT") return `${i.name} Futures`;
  const kind = i.instrumentType === "CE" ? "Call" : i.instrumentType === "PE" ? "Put" : i.instrumentType;
  return `${i.name} ${strike > 0 ? strike : ""} ${kind}`.trim();
}

export async function ensureAssetForInstrument(instrumentToken: string): Promise<Asset> {
  const existing = await prisma.asset.findUnique({ where: { instrumentToken } });
  if (existing) return existing;

  const instrument = await prisma.instrument.findUnique({ where: { instrumentToken } });
  if (!instrument) throw notFound("Instrument not found");

  const assetClass = isIndexUnderlying(instrument.name) ? "INDEX" : "STOCK";
  const symbol = instrument.tradingsymbol;
  const strike = Number(instrument.strike);

  try {
    const asset = await prisma.asset.create({
      data: {
        symbol,
        name: friendlyName(instrument),
        assetClass,
        segment: instrument.segment,
        baseCurrency: underlyingSymbol(instrument.name),
        quoteCurrency: "INR",
        contractSize: instrument.lotSize,
        tickSize: instrument.tickSize,
        minQty: 1,
        maxLeverage: 10,
        feedSource: "kite",
        instrumentToken,
        expiry: instrument.expiry,
        strike: strike > 0 ? strike : null,
        optionType: instrument.instrumentType === "CE" || instrument.instrumentType === "PE" ? instrument.instrumentType : null,
        enabled: true,
      },
    });
    await publishRegistry().catch(() => undefined);
    return asset;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const found = await prisma.asset.findFirst({ where: { OR: [{ instrumentToken }, { symbol }] } });
      if (found) return found;
    }
    throw err;
  }
}
