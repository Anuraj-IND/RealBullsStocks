import { describe, it, expect } from "vitest";
import {
  requiredMargin,
  unrealizedPnl,
  realizedPnl,
  marginLevel,
  evaluateRisk,
  liquidationPrice,
  isLiquidated,
  quotedSpread,
  fillPrice,
  weightedAverageEntry,
  previewOrder,
  isLossLimitReached,
  quoteToInr,
  DEFAULT_USD_INR,
  notionalValue,
} from "../src/index.js";

describe("margin", () => {
  it("computes forex margin with lot contract size", () => {
    expect(requiredMargin({ qty: 1, price: 1.1, contractSize: 100000, leverage: 100 })).toBeCloseTo(1100, 6);
  });

  it("computes crypto margin", () => {
    expect(requiredMargin({ qty: 2, price: 60000, contractSize: 1, leverage: 20 })).toBe(6000);
  });

  it("throws on non-positive leverage", () => {
    expect(() => requiredMargin({ qty: 1, price: 1, leverage: 0 })).toThrow();
  });
});

describe("loss limit", () => {
  it("triggers at 95% loss of balance", () => {
    expect(isLossLimitReached(1000, -950)).toBe(true);
    expect(isLossLimitReached(1000, -949.99)).toBe(false);
    expect(isLossLimitReached(1000, 0)).toBe(false);
    expect(isLossLimitReached(0, -1)).toBe(false);
  });
});
describe("pnl", () => {
  it("long profits when price rises", () => {
    expect(
      unrealizedPnl({ side: "BUY", qty: 1, avgEntryPrice: 100, markPrice: 110, contractSize: 1 }),
    ).toBe(10);
  });

  it("short profits when price falls", () => {
    expect(
      unrealizedPnl({ side: "SELL", qty: 1, avgEntryPrice: 100, markPrice: 90, contractSize: 1 }),
    ).toBe(10);
  });

  it("applies contract size and fx", () => {
    expect(
      realizedPnl({
        side: "BUY",
        qty: 1,
        entryPrice: 1.1,
        exitPrice: 1.101,
        contractSize: 100000,
      }),
    ).toBeCloseTo(100, 5);
  });
});

describe("risk", () => {
  it("returns infinity margin level when flat", () => {
    expect(marginLevel(100, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("classifies stop out before margin call", () => {
    expect(evaluateRisk({ equity: 40, marginUsed: 100, marginCallPct: 100, stopOutPct: 50 })).toBe(
      "STOP_OUT",
    );
    expect(evaluateRisk({ equity: 80, marginUsed: 100, marginCallPct: 100, stopOutPct: 50 })).toBe(
      "MARGIN_CALL",
    );
    expect(evaluateRisk({ equity: 200, marginUsed: 100, marginCallPct: 100, stopOutPct: 50 })).toBe(
      "OK",
    );
  });
});

describe("liquidation", () => {
  it("long liquidation is below entry", () => {
    const liq = liquidationPrice({ side: "BUY", avgEntryPrice: 100, leverage: 10, stopOutPct: 50 });
    expect(liq).toBeLessThan(100);
    expect(liq).toBeCloseTo(100 * (1 - 0.1 + 0.05), 6); 
  });

  it("short liquidation is above entry", () => {
    const liq = liquidationPrice({ side: "SELL", avgEntryPrice: 100, leverage: 10, stopOutPct: 50 });
    expect(liq).toBeGreaterThan(100);
  });

  it("detects liquidation crossing", () => {
    expect(isLiquidated({ side: "BUY", markPrice: 94, liquidationPrice: 95 })).toBe(true);
    expect(isLiquidated({ side: "BUY", markPrice: 96, liquidationPrice: 95 })).toBe(false);
    expect(isLiquidated({ side: "SELL", markPrice: 106, liquidationPrice: 105 })).toBe(true);
  });
});

describe("spread & fills", () => {
  it("applies broker markup and markdown", () => {
    const { bid, ask } = quotedSpread({
      mid: 100,
      baseSpreadBps: 0,
      spreadMarkupBps: 10,
      spreadMarkdownBps: 10,
    });
    expect(ask).toBeCloseTo(100.1, 6);
    expect(bid).toBeCloseTo(99.9, 6);
  });

  it("buys at ask, sells at bid", () => {
    expect(fillPrice("BUY", 99, 101)).toBe(101);
    expect(fillPrice("SELL", 99, 101)).toBe(99);
  });
});

describe("position management", () => {
  it("weights average entry", () => {
    expect(weightedAverageEntry(1, 100, 1, 120)).toBe(110);
  });
});

describe("quote currency conversion (ledger is INR)", () => {
  it("leaves INR quotes untouched", () => {
    expect(quoteToInr(8350, "INR")).toBe(8350);
    expect(quoteToInr(9212, "INR")).toBe(9212);
  });

  it("converts foreign quotes at the default rate", () => {
    expect(DEFAULT_USD_INR).toBe(83.5);
    expect(quoteToInr(100, "USD")).toBeCloseTo(8350, 8);
    expect(quoteToInr(81725.88, "USDT")).toBeCloseTo(81725.88 * 83.5, 4);
    expect(quoteToInr(1.1, undefined)).toBeCloseTo(1.1 * 83.5, 8);
  });

  it("prices crude-oil futures correctly: qty x lot x price stays ₹", () => {
    // CRUDEOIL26NOVFUT ticket: 0.1 lots x lot size 1 x Rs 9,212.
    const notionalInr = notionalValue(0.1, 9212, 1);
    expect(notionalInr).toBeCloseTo(921.2, 6);
    expect(quoteToInr(notionalInr, "INR")).toBeCloseTo(921.2, 6);
    const margin = requiredMargin({ qty: 0.1, price: quoteToInr(9212, "INR"), contractSize: 1, leverage: 10 });
    expect(margin).toBeCloseTo(92.12, 6);
  });

  it("prices BTC in rupees: qty x price, then foreign→₹", () => {
    // 1 BTC @ $81,725.88 → ₹68,24,110.58.
    const notional = notionalValue(1, quoteToInr(81725.88, "USDT"), 1);
    expect(notional).toBeCloseTo(81725.88 * 83.5, 4);
  });

  it("prices cash equities as qty x price, staying ₹", () => {
    // AXISBANK-style: 2 shares x Rs 1,250, no lot multiplier.
    const notionalInr = notionalValue(2, 1250, 1);
    expect(notionalInr).toBe(2500);
    expect(quoteToInr(notionalInr, "INR")).toBe(2500);
  });
});

describe("order preview (shared by UI and server)", () => {
  const base = {
    side: "BUY" as const,
    qty: 1,
    price: 1.1,
    contractSize: 100000,
    leverage: 100,
    commissionPerLot: 3.5,
    balance: 5000,
    unrealizedPnl: 0,
    marginUsed: 0,
    marginCallPct: 100,
    stopOutPct: 50,
  };

  it("is affordable when free margin covers margin+commission", () => {
    const p = previewOrder(base);
    expect(p.requiredMargin).toBeCloseTo(1107, 6);
    expect(p.commission).toBe(3.5);
    expect(p.affordable).toBe(true);
    expect(p.freeMarginAfter).toBeCloseTo(5000 - 1107, 6);
  });

  it("quotes required margin inclusive of brokerage on both sides", () => {
    const p = previewOrder(base);
    expect(p.requiredMargin).toBeCloseTo(1100 + 3.5 * 2, 6);
    expect(p.freeMarginAfter).toBeCloseTo(p.freeMarginBefore - 1100 - 3.5 * 2, 6);
  });

  it("defines free margin after net of live P&L and locked margin", () => {
    const p = previewOrder({ ...base, unrealizedPnl: 200, marginUsed: 500 });
    // 5000 + 200 live profit − 500 already held − requirement: stacking a
    // second position prices off the first one's live hold, never raw balance.
    expect(p.freeMarginAfter).toBeCloseTo(5000 + 200 - 500 - p.requiredMargin, 6);
    expect(p.freeMarginAfter).toBeCloseTo(p.freeMarginBefore - p.requiredMargin, 6);
  });

  it("rejects when margin exceeds free margin", () => {
    const p = previewOrder({ ...base, qty: 10 }); 
    expect(p.affordable).toBe(false);
  });
});
