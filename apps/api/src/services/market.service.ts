import type { Asset, AssetConfig, LeverageRule, UserLeverageOverride } from "@realbulls/db";
import { quotedSpread, fillPrice } from "@realbulls/engine";
import { segmentForAssetClass, type OrderSide } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { redis, priceKey } from "../lib/redis.js";
import { env } from "../env.js";
import { D } from "../lib/money.js";


const SEED_PRICES: Record<string, number> = {
  BTCUSDT: 67000, ETHUSDT: 3500, SOLUSDT: 150, XRPUSDT: 0.52,
  EURUSD: 1.085, GBPUSD: 1.271, USDJPY: 151.2, AUDUSD: 0.659,
  XAUUSD: 2320, XAGUSD: 27.4, USOIL: 78.5,
  AAPL: 214, TSLA: 182, NVDA: 118, MSFT: 425,
  US500: 5450, NAS100: 19800,
  NIFTY50: 24350, BANKNIFTY: 52100, SENSEX: 79900, FINNIFTY: 23600,
  RELIANCE: 2960, TCS: 4120, INFY: 1830, HDFCBANK: 1685, ICICIBANK: 1195,
  SBIN: 815, BHARTIARTL: 1540, ITC: 442, LT: 3580, TATAMOTORS: 985,
  "NIFTY50-FUT": 24350, "BANKNIFTY-FUT": 52100, "RELIANCE-FUT": 2960, "TCS-FUT": 4120,
  "NIFTY-24400-CE": 120, "NIFTY-24400-PE": 90, "BANKNIFTY-52000-CE": 250, "RELIANCE-3000-CE": 40,
};

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


function optionStartPrice(a: Asset, underlying: number): number | null {
  if (!a.optionType || underlying <= 0) return null;
  const strike = a.strike ? Number(a.strike) : 0;
  if (strike <= 0) return null;
  const intrinsic = a.optionType === "CE" ? underlying - strike : strike - underlying;
  return Math.max(intrinsic, 0) + underlying * 0.008;
}

export async function publishRegistry(): Promise<void> {
  const assets = await prisma.asset.findMany({ where: { enabled: true } });
  const tokens = assets.map((a) => a.instrumentToken).filter((t): t is string => Boolean(t));
  const instruments = tokens.length
    ? await prisma.instrument.findMany({
        where: { instrumentToken: { in: tokens } },
        select: { instrumentToken: true, lastPrice: true, exchange: true, tradingsymbol: true },
      })
    : [];
  const byToken = new Map(instruments.map((i) => [i.instrumentToken, i]));
  const payload = {
    assets: assets.map((a) => {
      const inst = a.instrumentToken ? byToken.get(a.instrumentToken) : undefined;
      const livePrice = inst ? Number(inst.lastPrice) : 0;
      const underlyingPrice = SEED_PRICES[a.baseCurrency ?? ""] ?? 0;
      const derived = optionStartPrice(a, underlyingPrice);
      return {
        symbol: a.symbol,
        feedSource: a.feedSource,
        startPrice: livePrice > 0 ? livePrice : SEED_PRICES[a.symbol] ?? derived ?? 100,
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

export async function getQuote(symbol: string): Promise<{ bid: number; ask: number; mid: number } | null> {
  const raw = await redis.get(priceKey(symbol));
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as { bid: number; ask: number; mid: number };
    if (typeof t.mid !== "number") return null;
    return t;
  } catch {
    return null;
  }
}

export async function getEffectiveConfig(tenantId: string, asset: Asset): Promise<EffectiveConfig> {
  const config = await prisma.assetConfig.findUnique({
    where: { tenantId_assetId: { tenantId, assetId: asset.id } },
  });
  const c: AssetConfig | null = config;
  return {
    enabled: (c?.enabled ?? true) && asset.enabled,
    spreadMarkupBps: D.num(c?.spreadMarkupBps) || 0,
    spreadMarkdownBps: D.num(c?.spreadMarkdownBps) || 0,
    commissionPerLot: D.num(c?.commissionPerLot) || 0,
    commissionPerOrder: D.num(c?.commissionPerOrder) || 0,
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


export function isDerivativeSegment(segment: string): boolean {
  return (
    segment === "INDEX_FUTURES" ||
    segment === "INDEX_OPTIONS" ||
    segment === "STOCK_FUTURES" ||
    segment === "STOCK_OPTIONS"
  );
}


export async function getBrokerage(userId: string, config: EffectiveConfig): Promise<Brokerage> {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { commissionPerLotOverride: true, commissionPerOrderOverride: true },
      })
    : null;
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
  const segment = resolveAssetSegment(asset);
  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { allowedSegments: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { allowedSegments: true } }),
  ]);
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
  const segment = resolveAssetSegment(asset);
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
  fallbackMid: number,
): Promise<{ bid: number; ask: number; mid: number }> {
  const q = (await getQuote(asset.symbol)) ?? { bid: fallbackMid, ask: fallbackMid, mid: fallbackMid };
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
