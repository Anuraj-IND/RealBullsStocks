import type { OrderSide } from "@realbulls/shared";
import { dir } from "./margin.js";


export function liquidationPrice(args: {
  side: OrderSide;
  avgEntryPrice: number;
  leverage: number;
  stopOutPct?: number;
  contractSize?: number;
}): number {
  const { side, avgEntryPrice, leverage, stopOutPct = 50 } = args;
  if (leverage <= 0) throw new Error("leverage must be > 0");
  const maintenanceFraction = (1 / leverage) * (stopOutPct / 100);
  const bufferFraction = 1 / leverage - maintenanceFraction;
  const price = avgEntryPrice * (1 - dir(side) * bufferFraction);
  return price > 0 ? price : 0;
}


export function isLiquidated(args: {
  side: OrderSide;
  markPrice: number;
  liquidationPrice: number;
}): boolean {
  const { side, markPrice, liquidationPrice } = args;
  return side === "BUY" ? markPrice <= liquidationPrice : markPrice >= liquidationPrice;
}
