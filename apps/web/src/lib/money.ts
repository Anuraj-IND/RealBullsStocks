"use client";

import { useUiStore } from "./store";


export const USD_INR = Number(process.env.NEXT_PUBLIC_USD_INR ?? 83.5);

export interface Money {
  currency: "USD" | "INR";
  convert: (usd: number) => number;
  toUsd: (amount: number) => number;
  fmt: (usd: number | null | undefined) => string;
  signed: (usd: number | null | undefined) => string;
}


export function useMoney(): Money {
  const currency = useUiStore((s) => s.currency);

  function convert(usd: number): number {
    return currency === "INR" ? usd * USD_INR : usd;
  }

  function fmt(usd: number | null | undefined): string {
    if (usd === null || usd === undefined || Number.isNaN(usd)) return "—";
    return convert(usd).toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function signed(usd: number | null | undefined): string {
    if (usd === null || usd === undefined || Number.isNaN(usd)) return "—";
    const s = usd > 0 ? "+" : "";
    return `${s}${fmt(usd)}`;
  }

  function toUsd(amount: number): number {
    return currency === "INR" ? amount / USD_INR : amount;
  }

  return { currency, convert, toUsd, fmt, signed };
}
