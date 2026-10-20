import type { OrderSide } from "@realbulls/shared";

export interface Instrument {
  contractSize: number;
  tickSize: number;
  quoteCurrency: string;
}


export function dir(side: OrderSide): 1 | -1 {
  return side === "BUY" ? 1 : -1;
}


export function notionalValue(qty: number, price: number, contractSize = 1): number {
  return qty * price * contractSize;
}


export function requiredMargin(args: {
  qty: number;
  price: number;
  contractSize?: number;
  leverage: number;
}): number {
  const { qty, price, contractSize = 1, leverage } = args;
  if (leverage <= 0) throw new Error("leverage must be > 0");
  return notionalValue(qty, price, contractSize) / leverage;
}


export function freeMargin(equity: number, marginUsed: number): number {
  return equity - marginUsed;
}


export function equity(balance: number, unrealizedPnl: number): number {
  return balance + unrealizedPnl;
}


export function marginLevel(equityValue: number, marginUsed: number): number {
  if (marginUsed <= 0) return Number.POSITIVE_INFINITY;
  return (equityValue / marginUsed) * 100;
}


export function commission(qty: number, commissionPerLot: number): number {
  return qty * commissionPerLot;
}

export type RiskState = "OK" | "MARGIN_CALL" | "STOP_OUT";


export function evaluateRisk(args: {
  equity: number;
  marginUsed: number;
  marginCallPct: number;
  stopOutPct: number;
}): RiskState {
  const level = marginLevel(args.equity, args.marginUsed);
  if (!Number.isFinite(level)) return "OK";
  if (level <= args.stopOutPct) return "STOP_OUT";
  if (level <= args.marginCallPct) return "MARGIN_CALL";
  return "OK";
}

export function canOpenPosition(available: number, required: number): boolean {
  return available >= required;
}

export function isLossLimitReached(balance: number, unrealizedPnl: number, lossPct = 0.95): boolean {
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(unrealizedPnl)) return false;
  return unrealizedPnl <= -(balance * lossPct);
}


export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}


export function weightedAverageEntry(
  existingQty: number,
  existingPrice: number,
  addQty: number,
  addPrice: number,
): number {
  const totalQty = existingQty + addQty;
  if (totalQty === 0) return 0;
  return (existingQty * existingPrice + addQty * addPrice) / totalQty;
}
