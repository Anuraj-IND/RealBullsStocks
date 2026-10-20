import { strFromU8, unzipSync } from "fflate";
import { prisma } from "../lib/prisma.js";
import { redis, priceKey } from "../lib/redis.js";
import { parseCsv } from "../lib/csv.js";
import { getNseMarketStatus } from "./market-status.service.js";

const NSE_ARCHIVE = "https://nsearchives.nseindia.com";
const SYNC_KEY = "market:close:lastSync";
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20000;

const NSE_HEADERS: Record<string, string> = {
  Accept: "text/csv,application/zip,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
};

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const INDEX_SYMBOLS: Record<string, string> = {
  "Nifty 50": "NIFTY50",
  "Nifty Bank": "BANKNIFTY",
  "Nifty Financial Services": "FINNIFTY",
  "Nifty Fin Service": "FINNIFTY",
};

interface TradeDate {
  dateKey: string;
  compact: string;
  dmy: string;
  asOf: Date;
}

interface CloseRow {
  price: number;
  asOf: Date;
  source: string;
}

function parseTradeDate(raw?: string): TradeDate | null {
  const value = (raw ?? "").trim();
  const named = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(value);
  const numeric = /^(\d{1,2})-(\d{2})-(\d{4})/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const day = Number(named?.[1] ?? numeric?.[1] ?? iso?.[3]);
  const month = named
    ? MONTHS[named[2] ?? ""]
    : numeric
      ? Number(numeric[2]) - 1
      : iso
        ? Number(iso[2]) - 1
        : undefined;
  const year = Number(named?.[3] ?? numeric?.[3] ?? iso?.[1]);
  if (!day || month === undefined || !year || month < 0 || month > 11) return null;
  const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    dateKey,
    compact: `${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`,
    dmy: `${String(day).padStart(2, "0")}${String(month + 1).padStart(2, "0")}${year}`,
    asOf: new Date(Date.UTC(year, month, day, 10, 0, 0)),
  };
}

function shiftDate(date: TradeDate, days: number): TradeDate {
  const d = new Date(Date.UTC(date.asOf.getUTCFullYear(), date.asOf.getUTCMonth(), date.asOf.getUTCDate() + days));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    compact: `${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`,
    dmy: `${String(day).padStart(2, "0")}${String(month + 1).padStart(2, "0")}${year}`,
    asOf: new Date(Date.UTC(year, month, day, 10, 0, 0)),
  };
}

function istTradeDate(): TradeDate {
  const d = new Date(Date.now() + 330 * 60000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    compact: `${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`,
    dmy: `${String(day).padStart(2, "0")}${String(month + 1).padStart(2, "0")}${year}`,
    asOf: new Date(Date.UTC(year, month, day, 10, 0, 0)),
  };
}

function candidateDates(tradeDate: TradeDate | null): TradeDate[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(tradeDate ?? istTradeDate(), -i));
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: NSE_HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`NSE archive ${response.status}: ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchZipCsv(url: string): Promise<string> {
  const archive = unzipSync(await fetchBytes(url));
  const entry = Object.entries(archive).find(([name]) => name.toLowerCase().endsWith(".csv"));
  if (!entry) throw new Error(`No CSV in archive: ${url}`);
  return strFromU8(entry[1]);
}

function numberAt(row: string[], index: number): number {
  const value = Number((row[index] ?? "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function parseNseClose(
  csv: string,
  keyIndexName: "FinInstrmNm" | "TckrSymb",
  source: "NSE_FO" | "NSE_CM",
): Map<string, CloseRow> {
  const rows = parseCsv(csv);
  const header = (rows[0] ?? []).map((value) => value.trim());
  const keyIndex = header.indexOf(keyIndexName);
  const closeIndex = header.indexOf("ClsPric");
  const lastIndex = header.indexOf("LastPric");
  const dateIndex = header.indexOf("TradDt");
  if (keyIndex < 0 || closeIndex < 0) return new Map();

  const out = new Map<string, CloseRow>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const key = (row[keyIndex] ?? "").trim();
    const close = numberAt(row, closeIndex);
    const last = numberAt(row, lastIndex);
    const price = close > 0 ? close : last;
    if (!key || price <= 0) continue;
    const parsed = parseTradeDate(row[dateIndex] ?? "");
    out.set(key, {
      price,
      asOf: parsed?.asOf ?? new Date(),
      source,
    });
  }
  return out;
}

function parseIndexClose(csv: string): Map<string, CloseRow> {
  const rows = parseCsv(csv);
  const header = (rows[0] ?? []).map((value) => value.trim());
  const nameIndex = header.indexOf("Index Name");
  const closeIndex = header.indexOf("Closing Index Value");
  const dateIndex = header.indexOf("Index Date");
  if (nameIndex < 0 || closeIndex < 0) return new Map();

  const out = new Map<string, CloseRow>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const name = (row[nameIndex] ?? "").trim();
    const symbol = INDEX_SYMBOLS[name];
    const price = numberAt(row, closeIndex);
    if (!symbol || price <= 0) continue;
    const parsed = parseTradeDate(row[dateIndex] ?? "");
    out.set(symbol, {
      price,
      asOf: parsed?.asOf ?? new Date(),
      source: "NSE_INDEX",
    });
  }
  return out;
}

async function applySymbolCloses(rows: Map<string, CloseRow>): Promise<number> {
  if (rows.size === 0) return 0;
  const assets = await prisma.asset.findMany({
    where: { quoteCurrency: "INR", feedSource: "nse" },
    select: { id: true, symbol: true, instrumentToken: true },
  });
  let applied = 0;
  for (const asset of assets) {
    const row = rows.get(asset.symbol);
    if (!row) continue;
    await prisma.$transaction(async (tx) => {
      await tx.marketClose.upsert({
        where: { assetId: asset.id },
        update: { price: row.price, asOf: row.asOf, source: row.source },
        create: { assetId: asset.id, price: row.price, asOf: row.asOf, source: row.source },
      });
      if (asset.instrumentToken) {
        await tx.instrument.update({
          where: { instrumentToken: asset.instrumentToken },
          data: { lastPrice: row.price },
        });
      }
    });
    applied++;
  }
  return applied;
}

async function syncForDate(date: TradeDate): Promise<{ fo: number; cm: number; index: number }> {
  const foCsv = await fetchZipCsv(
    `${NSE_ARCHIVE}/content/fo/BhavCopy_NSE_FO_0_0_0_${date.compact}_F_0000.csv.zip`,
  );
  const cmCsv = await fetchZipCsv(
    `${NSE_ARCHIVE}/content/cm/BhavCopy_NSE_CM_0_0_0_${date.compact}_F_0000.csv.zip`,
  );
  const indexCsv = strFromU8(
    await fetchBytes(`${NSE_ARCHIVE}/content/indices/ind_close_all_${date.dmy}.csv`),
  );

  const foRows = parseNseClose(foCsv, "FinInstrmNm", "NSE_FO");
  const cmRows = parseNseClose(cmCsv, "TckrSymb", "NSE_CM");
  const indexRows = parseIndexClose(indexCsv);

  const fo = await applySymbolCloses(foRows);
  const cm = await applySymbolCloses(cmRows);
  const index = await applySymbolCloses(indexRows);
  return { fo, cm, index };
}

async function purgeClosedMarketQuotes(status: { open: boolean }): Promise<void> {
  if (status.open) return;
  const assets = await prisma.asset.findMany({
    where: { OR: [{ feedSource: "nse" }, { feedSource: "" }] },
    select: { symbol: true },
  });
  const keys = assets.map((asset) => priceKey(asset.symbol));
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    if (chunk.length > 0) await redis.del(...chunk);
  }
}

export async function syncMarketCloses(force = false): Promise<{ date: string; fo: number; cm: number; index: number } | null> {
  const status = await getNseMarketStatus();
  const dates = candidateDates(parseTradeDate(status.tradeDate));
  if (dates.length === 0) return null;
  await purgeClosedMarketQuotes(status);

  const last = await redis.get(SYNC_KEY);
  if (!force && last) {
    try {
      const parsed = JSON.parse(last) as { date: string; fo: number; cm: number; index: number };
      if (parsed.date === dates[0]!.dateKey) return parsed;
    } catch {
      // Ignore malformed cache.
    }
  }

  for (const date of dates) {
    try {
      const result = await syncForDate(date);
      if (result.fo === 0 && result.cm === 0 && result.index === 0) continue;
      const payload = { date: date.dateKey, ...result };
      await redis.set(SYNC_KEY, JSON.stringify(payload), "EX", 7 * 24 * 60 * 60);
      console.log(`[market-close] ${date.dateKey}: ${result.fo} FO, ${result.cm} CM, ${result.index} index`);
      return payload;
    } catch (err) {
      console.warn(`[market-close] ${date.dateKey} unavailable: ${(err as Error).message}`);
    }
  }

  return null;
}

let timer: NodeJS.Timeout | null = null;

export function startMarketCloseSync(): void {
  if (timer) return;
  void syncMarketCloses().catch((err) => console.error("[market-close] initial sync failed", err));
  timer = setInterval(() => {
    void syncMarketCloses().catch((err) => console.error("[market-close] sync failed", err));
  }, SYNC_INTERVAL_MS);
  timer.unref?.();
}

export function stopMarketCloseSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
