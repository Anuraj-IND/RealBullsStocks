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
    expect(p.requiredMargin).toBeCloseTo(1100, 6);
    expect(p.commission).toBe(3.5);
    expect(p.affordable).toBe(true);
    expect(p.freeMarginAfter).toBeCloseTo(5000 - 1100 - 3.5, 6);
  });

  it("rejects when margin exceeds free margin", () => {
    const p = previewOrder({ ...base, qty: 10 }); 
    expect(p.affordable).toBe(false);
  });
});
