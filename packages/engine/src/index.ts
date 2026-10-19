export * from "./margin.js";
export * from "./pnl.js";
export * from "./liquidation.js";

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
  const freeAfter = freeBefore - margin - fee;

  return {
    notional: notionalValue(qty, price, contractSize),
    requiredMargin: margin,
    commission: fee,
    liquidationPrice: liquidationPrice({ side, avgEntryPrice: price, leverage, stopOutPct }),
    freeMarginBefore: freeBefore,
    freeMarginAfter: freeAfter,
    affordable: freeBefore >= margin + fee,
    risk: evaluateRisk({
      equity: equityBefore,
      marginUsed: marginUsed + margin,
      marginCallPct,
      stopOutPct,
    }),
  };
}
