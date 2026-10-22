export * from "./margin.js";
export * from "./pnl.js";
export * from "./liquidation.js";
export * from "./currency.js";

import type { OrderSide } from "@realbulls/shared";
import { requiredMargin, notionalValue, commission, freeMargin, equity, evaluateRisk, type RiskState } from "./margin.js";
import { liquidationPrice } from "./liquidation.js";

export interface OrderPreview {
  notional: number;
  requiredMargin: number;
  commission: number;
  liquidationPrice: number;
  freeMarginBefore: number;
  freeMarginAfter: number;
  affordable: boolean;
  risk: RiskState;
}


export function previewOrder(args: {
  side: OrderSide;
  qty: number;
  price: number;
  contractSize: number;
  leverage: number;
  commissionPerLot: number;
  
  commissionPerOrder?: number;
  balance: number;
  unrealizedPnl: number;
  marginUsed: number;
  marginCallPct: number;
  stopOutPct: number;
}): OrderPreview {
  const {
    side,
    qty,
    price,
    contractSize,
    leverage,
    commissionPerLot,
    commissionPerOrder,
    balance,
    unrealizedPnl,
    marginUsed,
    marginCallPct,
    stopOutPct,
  } = args;

  const margin = requiredMargin({ qty, price, contractSize, leverage });
  const fee = commissionPerOrder && commissionPerOrder > 0 ? commissionPerOrder : commission(qty, commissionPerLot);
  const equityBefore = equity(balance, unrealizedPnl);
  const freeBefore = freeMargin(equityBefore, marginUsed);
  // Required margin is quoted inclusive of brokerage on BOTH sides: the fee
  // is charged when the position opens and again when it closes (incl.
  // stop-loss closes), so the user must hold margin + 2× fee.
  const required = margin + fee * 2;

  return {
    notional: notionalValue(qty, price, contractSize),
    requiredMargin: required,
    commission: fee,
    liquidationPrice: liquidationPrice({ side, avgEntryPrice: price, leverage, stopOutPct }),
    freeMarginBefore: freeBefore,
    // Free margin after = true free funds (balance + live P&L − already
    // locked margin) minus this order's requirement — so stacking a second
    // position prices off the first one's live hold, never the raw balance.
    freeMarginAfter: freeBefore - required,
    affordable: freeBefore >= required,
    risk: evaluateRisk({
      equity: equityBefore,
      marginUsed: marginUsed + margin,
      marginCallPct,
      stopOutPct,
    }),
  };
}
