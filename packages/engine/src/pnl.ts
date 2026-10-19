import type { OrderSide } from "@realbulls/shared";
import { dir } from "./margin.js";


export function unrealizedPnl(args: {
  side: OrderSide;
  qty: number;
  avgEntryPrice: number;
  markPrice: number;
  contractSize?: number;
  quoteToAccountFx?: number;
}): number {
  const { side, qty, avgEntryPrice, markPrice, contractSize = 1, quoteToAccountFx = 1 } = args;
  return (markPrice - avgEntryPrice) * qty * contractSize * dir(side) * quoteToAccountFx;
}


export function realizedPnl(args: {
  side: OrderSide;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  contractSize?: number;
  quoteToAccountFx?: number;
}): number {
  const { side, qty, entryPrice, exitPrice, contractSize = 1, quoteToAccountFx = 1 } = args;
  return (exitPrice - entryPrice) * qty * contractSize * dir(side) * quoteToAccountFx;
}


export function swapFee(args: { qty: number; nights: number; swapPerLotPerNight: number }): number {
  return -Math.abs(args.qty * args.nights * args.swapPerLotPerNight);
}


export function rawSpread(mid: number, baseSpreadBps: number): { bid: number; ask: number } {
  const half = (baseSpreadBps / 10000) / 2;
  return { bid: mid * (1 - half), ask: mid * (1 + half) };
}


export function quotedSpread(args: {
  mid: number;
  baseSpreadBps?: number;
  spreadMarkupBps?: number;
  spreadMarkdownBps?: number;
}): { bid: number; ask: number } {
  const { mid, baseSpreadBps = 0, spreadMarkupBps = 0, spreadMarkdownBps = 0 } = args;
  const { bid, ask } = rawSpread(mid, baseSpreadBps);
  const up = (spreadMarkupBps / 10000);
  const down = (spreadMarkdownBps / 10000);
  return { bid: bid * (1 - down), ask: ask * (1 + up) };
}


export function fillPrice(side: OrderSide, bid: number, ask: number): number {
  return side === "BUY" ? ask : bid;
}
