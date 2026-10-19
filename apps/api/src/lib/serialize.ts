import type { Asset, LedgerEntry, Order, Position } from "@realbulls/db";
import type { LedgerDTO, OrderDTO, PositionDTO } from "@realbulls/shared";
import { D } from "./money.js";

export function toPositionDTO(p: Position, symbol: string, markPrice?: number): PositionDTO {
  return {
    id: p.id,
    assetId: p.assetId,
    symbol,
    side: p.side as PositionDTO["side"],
    qty: D.num(p.qty),
    avgEntryPrice: D.num(p.avgEntryPrice),
    leverage: p.leverage,
    marginUsed: D.num(p.marginUsed),
    stopLoss: p.stopLoss === null ? null : D.num(p.stopLoss),
    takeProfit: p.takeProfit === null ? null : D.num(p.takeProfit),
    unrealizedPnl: D.num(p.unrealizedPnl),
    realizedPnl: D.num(p.realizedPnl),
    commission: D.num(p.commission),
    liquidationPrice: p.liquidationPrice === null ? null : D.num(p.liquidationPrice),
    status: p.status as PositionDTO["status"],
    openedAt: p.openedAt.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    closedPrice: p.closedPrice === null ? null : D.num(p.closedPrice),
    markPrice,
  };
}

export function toOrderDTO(o: Order, symbol: string): OrderDTO {
  return {
    id: o.id,
    assetId: o.assetId,
    symbol,
    side: o.side as OrderDTO["side"],
    type: o.type as OrderDTO["type"],
    qty: D.num(o.qty),
    price: o.price === null ? null : D.num(o.price),
    triggerPrice: o.triggerPrice === null ? null : D.num(o.triggerPrice),
    stopLoss: o.stopLoss === null ? null : D.num(o.stopLoss),
    takeProfit: o.takeProfit === null ? null : D.num(o.takeProfit),
    leverage: o.leverage,
    status: o.status as OrderDTO["status"],
    filledPrice: o.filledPrice === null ? null : D.num(o.filledPrice),
    filledQty: D.num(o.filledQty),
    rejectReason: o.rejectReason,
    createdAt: o.createdAt.toISOString(),
    filledAt: o.filledAt ? o.filledAt.toISOString() : null,
    kind: "ORDER",
  };
}

export function toLedgerDTO(e: LedgerEntry): LedgerDTO {
  return {
    id: e.id,
    direction: e.direction as LedgerDTO["direction"],
    type: e.type,
    amount: D.num(e.amount),
    balanceAfter: D.num(e.balanceAfter),
    currency: e.currency,
    refType: e.refType,
    refId: e.refId,
    memo: e.memo,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toAssetDTO(
  a: Asset,
  config?: { spreadMarkupBps: number; commissionPerLot: number; commissionPerOrder?: number } | null,
) {
  return {
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    assetClass: a.assetClass,
    baseCurrency: a.baseCurrency,
    quoteCurrency: a.quoteCurrency,
    contractSize: D.num(a.contractSize),
    tickSize: D.num(a.tickSize),
    minQty: D.num(a.minQty),
    maxLeverage: a.maxLeverage,
    feedSource: a.feedSource,
    enabled: a.enabled,
    spreadMarkupBps: config?.spreadMarkupBps ?? 0,
    commissionPerLot: config?.commissionPerLot ?? 0,
    commissionPerOrder: config?.commissionPerOrder ?? 0,
  };
}
