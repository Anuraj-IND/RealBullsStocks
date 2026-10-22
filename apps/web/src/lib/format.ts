import { toDisplayPrice, displayDigits, toMarketPrice } from "@realbulls/engine";
import { USD_INR } from "./money";

export function fmtPrice(value: number | null | undefined, digits?: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const d = digits ?? (value >= 1000 ? 2 : value >= 10 ? 3 : 5);
  return value.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Market-terms price → ₹ display. INR as-is; USD/USDT ×83.5; foreign/FX
// ratios render as plain numbers with no symbol; unknown currency renders
// "—" instead of a wrong magnitude. Digits derive from converted magnitude.
export function fmtMarket(value: number | null | undefined, quoteCurrency?: string | null, digits?: number): string {
  const d = toDisplayPrice(value, quoteCurrency, USD_INR);
  if (d.kind === "empty") return "—";
  const dig = digits ?? displayDigits(d.value);
  if (d.kind === "plain") {
    return d.value.toLocaleString("en-US", { minimumFractionDigits: dig, maximumFractionDigits: dig });
  }
  return d.value.toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: dig, maximumFractionDigits: dig });
}

// Inverse for ₹-typed inputs (limit/stop/SL/TP/alerts): display value back
// to market terms for the API, rounded to the asset tick.
export function toMarket(displayValue: number, quoteCurrency?: string | null, tickSize = 0): number {
  return toMarketPrice(displayValue, quoteCurrency, USD_INR, tickSize);
}

export function fmtSigned(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const s = value > 0 ? "+" : "";
  return `${s}${value.toFixed(2)}`;
}

export function fmtAsOf(value: number | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}

export function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function assetMarketLabel(assetClass: string, segment?: string): string {
  const s = (segment ?? "").toUpperCase();
  if (s.startsWith("NFO")) return "NFO";
  if (s.startsWith("BFO")) return "BFO";
  return assetClass;
}

export function isDerivativeSegment(segment?: string): boolean {
  const s = (segment ?? "").toUpperCase();
  return s.includes("FUT") || s.includes("OPT");
}
