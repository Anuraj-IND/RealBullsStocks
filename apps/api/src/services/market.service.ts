import type { Asset, AssetConfig, LeverageRule, UserLeverageOverride } from "@realbulls/db";
import { quotedSpread, fillPrice } from "@realbulls/engine";
import { segmentForAssetClass, type OrderSide } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { redis, priceKey } from "../lib/redis.js";
import { env } from "../env.js";
import { D } from "../lib/money.js";
import { badRequest } from "../lib/errors.js";
import { getNseMarketStatus, getNseTradingHolidays } from "./market-status.service.js";

const MAX_QUOTE_AGE_MS = 5 * 60 * 1000;

export interface EffectiveConfig {
  enabled: boolean;
  spreadMarkupBps: number;
  spreadMarkdownBps: number;
  commissionPerLot: number;
  commissionPerOrder: number;
  minLeverage: number;
  maxLeverageOverride: number | null;
}

export interface RiskProfile {
  leverage: number;
  marginCallPct: number;
  stopOutPct: number;
}


export async function publishRegistry(): Promise<void> {
  const assets = await prisma.asset.findMany({ where: { enabled: true } });
  const tokens = assets.map((a) => a.instrumentToken).filter((t): t is string => Boolean(t));
  const instruments = tokens.length
    ? await prisma.instrument.findMany({
        where: { instrumentToken: { in: tokens } },
        select: { instrumentToken: true, exchange: true, tradingsymbol: true },
      })
    : [];
  // Keep the status and holiday calls sequential: NSE rate-limits concurrent
  // requests from the same IP, which otherwise drops the holiday description.
  const marketStatus = await getNseMarketStatus();
  const holidays = await getNseTradingHolidays();
  const byToken = new Map(instruments.map((i) => [i.instrumentToken, i]));
  const payload = {
    holidays,
    marketStatus,
    assets: assets.map((a) => {
      const inst = a.instrumentToken ? byToken.get(a.instrumentToken) : undefined;
      return {
        symbol: a.symbol,
        feedSource: a.feedSource,
        startPrice: 0,
        assetClass: a.assetClass,
        quoteCurrency: a.quoteCurrency,
        segment: a.segment,
        underlying: a.baseCurrency,
        instrumentToken: a.instrumentToken ?? "",
        exchange: inst?.exchange ?? "",
        tradingsymbol: inst?.tradingsymbol ?? a.symbol,
      };
    }),
  };
  await redis.set(env.registryKey, JSON.stringify(payload));
}

export async function getQuote(
  symbol: string,
): Promise<{ bid: number; ask: number; mid: number; ts?: number } | null> {
  const raw = await redis.get(priceKey(symbol));
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as { bid: number; ask: number; mid: number; ts?: number };
    if (typeof t.mid !== "number") return null;
    return t;
  } catch {
    return null;
  }
}

export interface AssetQuote {
  bid: number;
  ask: number;
  mid: number;
  ts?: number;
  asOf?: number;
  source: "redis";
  kind: "live";
}

export async function getQuoteForAsset(asset: Asset): Promise<AssetQuote | null> {
  const quote = await getQuote(asset.symbol);
  if (!quote || quote.mid <= 0 || !quote.ts) return null;
  if (Date.now() - quote.ts > MAX_QUOTE_AGE_MS) return null;
  return { ...quote, source: "redis", kind: "live", asOf: quote.ts };
}

export async function getEffectiveConfig(tenantId: string, asset: Asset): Promise<EffectiveConfig> {
  const config = await prisma.assetConfig.findUnique({
    where: { tenantId_assetId: { tenantId, assetId: asset.id } },
  });
  const c: AssetConfig | null = config;
  // Class fallbacks mirror the seed so instrument-created assets (which have
  // no AssetConfig row) get the same brokerage as seeded ones. Spreads stay 0
  // unless explicitly configured. Values are rupees (see getBrokerage).
  const fallbackLot = asset.assetClass === "FOREX" ? 3.5 : asset.assetClass === "COMMODITY" ? 1.5 : 0;
  return {
    enabled: (c?.enabled ?? true) && asset.enabled,
    spreadMarkupBps: D.num(c?.spreadMarkupBps) || 0,
    spreadMarkdownBps: D.num(c?.spreadMarkdownBps) || 0,
    commissionPerLot: c?.commissionPerLot != null ? D.num(c.commissionPerLot) : fallbackLot,
    commissionPerOrder: c?.commissionPerOrder != null ? D.num(c.commissionPerOrder) : 0,
    minLeverage: c?.minLeverage ?? 1,
    maxLeverageOverride: c?.maxLeverage ?? null,
  };
}

export interface Brokerage {
  perLot: number;
  perOrder: number;
}


export function resolveAssetSegment(asset: Asset): string {
  return asset.segment && asset.segment.length > 0
    ? asset.segment
    : segmentForAssetClass(asset.assetClass as Parameters<typeof segmentForAssetClass>[0]);
}


// Admin-facing segment vocabulary (shared SEGMENTS: INDEX_FUTURES, COMMODITY,
// …) vs exchange-style segments stored on assets (NFO-FUT, MCX-OPT, …).
// Canonicalize before any comparison so per-segment leverage overrides and
// tradability lists actually match. Idempotent on canonical values.
export function canonicalSegment(asset: Pick<Asset, "segment" | "assetClass">): string {
  const seg = resolveAssetSegment(asset as Asset);
  const raw = seg.toUpperCase();
  if (raw.startsWith("MCX")) return "COMMODITY";
  const isIndex = (asset.assetClass ?? "").toUpperCase() === "INDEX";
  if (raw.includes("FUT")) return isIndex ? "INDEX_FUTURES" : "STOCK_FUTURES";
  if (raw.includes("OPT")) return isIndex ? "INDEX_OPTIONS" : "STOCK_OPTIONS";
  if (raw === "NSE" || raw === "BSE") return "EQUITY";
  return seg;
}


export function isDerivativeSegment(segment: string): boolean {
  const upper = segment.toUpperCase();
  return upper.includes("FUT") || upper.includes("OPT");
}


export async function getBrokerage(userId: string, config: EffectiveConfig): Promise<Brokerage> {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { commissionPerLotOverride: true, commissionPerOrderOverride: true },
      })
    : null;
  // Brokerage is always configured in rupees (per-lot/per-order, incl. user
  // overrides) and the ledger is rupee-denominated — pass through unchanged.
  const perLot =
    user?.commissionPerLotOverride !== null && user?.commissionPerLotOverride !== undefined
      ? D.num(user.commissionPerLotOverride)
      : config.commissionPerLot;
  const perOrder =
    user?.commissionPerOrderOverride !== null && user?.commissionPerOrderOverride !== undefined
      ? D.num(user.commissionPerOrderOverride)
      : config.commissionPerOrder;
  return { perLot, perOrder };
}


export function brokerageForQty(isDerivative: boolean, qty: number, brokerage: Brokerage): number {
  return isDerivative ? brokerage.perLot * qty : brokerage.perOrder;
}


export async function isSegmentTradable(userId: string, tenantId: string, asset: Asset): Promise<boolean> {
  const segment = canonicalSegment(asset);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, allowedSegments: true } });
  if (user?.role === "SUPER_ADMIN") return true;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { allowedSegments: true } });
  const list = user?.allowedSegments?.length ? user.allowedSegments : tenant?.allowedSegments?.length ? tenant.allowedSegments : [];
  return list.length === 0 || list.includes(segment);
}

function pickRule(
  rules: LeverageRule[],
  asset: Asset,
): LeverageRule | undefined {
  return (
    rules.find((r) => r.scope === "ASSET" && r.assetId === asset.id) ??
    rules.find((r) => r.scope === "ASSET_CLASS" && r.assetClass === asset.assetClass) ??
    rules.find((r) => r.scope === "GLOBAL")
  );
}


export async function resolveRisk(
  userId: string,
  tenantId: string,
  asset: Asset,
  config: EffectiveConfig,
): Promise<RiskProfile> {
  const overrides: UserLeverageOverride[] = await prisma.userLeverageOverride.findMany({
    where: { userId },
  });
  const segment = canonicalSegment(asset);
  const userOverride =
    overrides.find((o) => o.assetId === asset.id) ??
    overrides.find((o) => o.assetId === null && o.assetClass === asset.assetClass) ??
    overrides.find((o) => o.assetId === null && o.assetClass === null && o.segment === segment);

  const tenantRules = await prisma.leverageRule.findMany({
    where: { tenantId, enabled: true },
  });
  const globalRules = await prisma.leverageRule.findMany({
    where: { tenantId: null, enabled: true },
  });

  const matched = pickRule(tenantRules, asset) ?? pickRule(globalRules, asset);

  let leverage = userOverride?.leverage ?? matched?.maxLeverage ?? asset.maxLeverage;
  if (config.maxLeverageOverride) leverage = Math.min(leverage, config.maxLeverageOverride);
  leverage = Math.min(leverage, asset.maxLeverage);
  leverage = Math.max(leverage, config.minLeverage, 1);

  return {
    leverage,
    marginCallPct: D.num(matched?.marginCallPct) || 100,
    stopOutPct: D.num(matched?.stopOutPct) || 5,
  };
}


export async function getExecutableQuote(
  tenantId: string,
  asset: Asset,
  config: EffectiveConfig,
): Promise<{ bid: number; ask: number; mid: number }> {
  const q = await getQuote(asset.symbol);
  if (!q || q.mid <= 0) throw badRequest("No live quote available for this instrument", "NO_QUOTE");
  if (!q.ts || Date.now() - q.ts > MAX_QUOTE_AGE_MS) {
    throw badRequest("Live quote is stale for this instrument", "STALE_QUOTE");
  }
  const { bid, ask } = quotedSpread({
    mid: q.mid,
    spreadMarkupBps: config.spreadMarkupBps,
    spreadMarkdownBps: config.spreadMarkdownBps,
  });
  return { bid, ask, mid: q.mid };
}

export function executablePrice(side: OrderSide, q: { bid: number; ask: number }): number {
  return fillPrice(side, q.bid, q.ask);
}
