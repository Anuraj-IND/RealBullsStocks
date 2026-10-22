import { describe, it, expect } from "vitest";
import {
  toDisplayPrice,
  toMarketPrice,
  displayDigits,
  DEFAULT_USD_INR,
} from "../src/index.js";

describe("currency display core", () => {
  it("passes INR through as rupees", () => {
    expect(toDisplayPrice(9415.94, "INR")).toEqual({ kind: "inr", value: 9415.94 });
  });

  it("converts USDT to rupees at the ledger rate", () => {
    const d = toDisplayPrice(81725.88, "USDT");
    expect(d.kind).toBe("inr");
    if (d.kind === "inr") expect(d.value).toBeCloseTo(81725.88 * DEFAULT_USD_INR, 6);
  });

  it("treats USD like USDT", () => {
    expect(toDisplayPrice(100, "USD")).toEqual({ kind: "inr", value: 100 * DEFAULT_USD_INR });
  });

  it("renders foreign quotes and FX ratios as plain numbers, never fake rupees", () => {
    expect(toDisplayPrice(150.25, "JPY")).toEqual({ kind: "plain", value: 150.25 });
    expect(toDisplayPrice(1.08342, "EUR")).toEqual({ kind: "plain", value: 1.08342 });
  });

  it("resolves missing currency, null and NaN to empty", () => {
    expect(toDisplayPrice(100)).toEqual({ kind: "empty" });
    expect(toDisplayPrice(100, "")).toEqual({ kind: "empty" });
    expect(toDisplayPrice(null, "INR")).toEqual({ kind: "empty" });
    expect(toDisplayPrice(NaN, "USDT")).toEqual({ kind: "empty" });
  });

  it("derives digits from the converted magnitude", () => {
    expect(displayDigits(6824109.11)).toBe(2); // BTC in ₹
    expect(displayDigits(9415.94)).toBe(2); // crude in ₹
    expect(displayDigits(265.4)).toBe(3);
    expect(displayDigits(1.08342)).toBe(5);
  });

  it("round-trips display input back to market terms", () => {
    // BTC @83.5 with 0.01 tick: typed ₹ → market $ → tick-rounded.
    const shown = 81725.88 * DEFAULT_USD_INR;
    expect(toMarketPrice(shown, "USDT", DEFAULT_USD_INR, 0.01)).toBeCloseTo(81725.88, 6);
    // INR passes through untouched.
    expect(toMarketPrice(9415.94, "INR", DEFAULT_USD_INR, 0.05)).toBeCloseTo(9415.95, 6);
    // Foreign/plain round-trips as identity.
    expect(toMarketPrice(1.08342, "EUR")).toBeCloseTo(1.08342, 9);
  });
});
