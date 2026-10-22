import { DEFAULT_USD_INR } from "./margin.js";

// Display-layer currency core (single source of truth for the ₹-only UI).
// The ledger stays USD; every conversion below happens at the display
// boundary. Ground truth: live registry holds INR + USDT only; the engine
// treats non-INR as USD, so USDT ×83.5 matches ledger treatment exactly.

export type DisplayPrice =
  | { kind: "inr"; value: number }
  | { kind: "plain"; value: number }
  | { kind: "empty" };

function canonicalQuote(quoteCurrency?: string | null): string {
  return (quoteCurrency ?? "").toUpperCase();
}

// Market-terms price → display value. INR as-is; USD/USDT ×83.5 into actual
// rupees; anything else (JPY, EUR, FX ratios) is a plain number with NO
// symbol — never a fake ₹ amount. Missing/unknown currency resolves to
// "empty" so the UI renders a placeholder instead of a wrong magnitude.
export function toDisplayPrice(
  price: number | null | undefined,
  quoteCurrency?: string | null,
  usdInr: number = DEFAULT_USD_INR,
): DisplayPrice {
  if (price === null || price === undefined || !Number.isFinite(price)) return { kind: "empty" };
  const q = canonicalQuote(quoteCurrency);
  if (!q) return { kind: "empty" };
  if (q === "INR") return { kind: "inr", value: price };
  if (q === "USD" || q === "USDT") return { kind: "inr", value: price * usdInr };
  return { kind: "plain", value: price };
}

// Inverse for ₹-typed inputs: display value → market terms for the API.
// Rounds to tickSize so the server never rejects on precision.
export function toMarketPrice(
  displayValue: number,
  quoteCurrency?: string | null,
  usdInr: number = DEFAULT_USD_INR,
  tickSize = 0,
): number {
  const q = canonicalQuote(quoteCurrency);
  const market = q === "USD" || q === "USDT" ? displayValue / usdInr : displayValue;
  if (!(tickSize > 0)) return market;
  return Math.round(market / tickSize) * tickSize;
}

// Digit ladder applied to the CONVERTED magnitude (₹68L → 2dp, ₹9.4k → 2dp,
// sub-10 values keep precision). Mirrors the old market-terms ladder so INR
// assets render exactly as before.
export function displayDigits(convertedValue: number): number {
  const a = Math.abs(convertedValue);
  if (a >= 1000) return 2;
  if (a >= 10) return 3;
  return 5;
}
