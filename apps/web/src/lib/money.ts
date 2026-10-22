"use client";

import { DEFAULT_USD_INR } from "@realbulls/engine";


// Foreign→₹ display rate for market-terms prices (see format.ts fmtMarket).
// Ledger math is ₹ end to end; this no longer touches ledger figures.
export const USD_INR = Number(process.env.NEXT_PUBLIC_USD_INR ?? DEFAULT_USD_INR);

function fmtInrRaw(inr: number | null | undefined): string {
  if (inr === null || inr === undefined || Number.isNaN(inr)) return "—";
  return inr.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Pure (hook-free) ₹ renderers for non-component call sites (WS toasts).
// Hook version below delegates to these.
export function fmtInr(inr: number | null | undefined): string {
  return fmtInrRaw(inr);
}

export function signedInr(inr: number | null | undefined): string {
  if (inr === null || inr === undefined || Number.isNaN(inr)) return "—";
  const s = inr > 0 ? "+" : "";
  return `${s}${fmtInrRaw(inr)}`;
}

export interface Money {
  convert: (inr: number) => number;
  toUsd: (amount: number) => number;
  fmt: (inr: number | null | undefined) => string;
  signed: (inr: number | null | undefined) => string;
}


export function useMoney(): Money {
  // Ledger is ₹ and the API returns ₹: identity at the display choke point.
  // Market-terms prices still convert via fmtMarket (format.ts).
  function convert(inr: number): number {
    return inr;
  }

  function fmt(inr: number | null | undefined): string {
    return fmtInrRaw(inr);
  }

  function signed(inr: number | null | undefined): string {
    return signedInr(inr);
  }

  function toUsd(amount: number): number {
    return amount;
  }

  return { convert, toUsd, fmt, signed };
}
