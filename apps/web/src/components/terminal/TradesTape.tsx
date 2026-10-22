"use client";

import { useEffect, useRef, useState } from "react";
import { cls, fmtMarket } from "@/lib/format";
import { useSymbolStats, useUiStore } from "@/lib/store";
import { useQuoteCurrency } from "@/lib/hooks";

interface Print {
  id: number;
  price: number;
  size: number;
  side: "BUY" | "SELL";
  ts: number;
}

const CAP = 18;

export function TradesTape() {
  const symbol = useUiStore((s) => s.activeSymbol);
  const { tick, tickChange } = useSymbolStats(symbol);
  const quoteCurrency = useQuoteCurrency(symbol);
  const [prints, setPrints] = useState<Print[]>([]);
  const idRef = useRef(0);
  const lastRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setPrints([]);
    lastRef.current = undefined;
    idRef.current = 0;
  }, [symbol]);

  useEffect(() => {
    if (!tick || tick.mid === lastRef.current) return;
    lastRef.current = tick.mid;
    const side: "BUY" | "SELL" = tickChange >= 0 ? "BUY" : "SELL";
    const price = tickChange >= 0 ? tick.ask : tick.bid;
    const size = Math.round(1 + Math.abs(Math.sin(tick.mid * 13.7 + idRef.current)) * 480);
    setPrints((prev) => [{ id: idRef.current++, price, size, side, ts: tick.ts }, ...prev].slice(0, CAP));
  }, [tick, tickChange]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Time &amp; Sales</span>
      </div>
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] uppercase tracking-wider text-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {prints.map((p) => (
          <div key={p.id} className="grid grid-cols-3 px-3 py-[3px] text-xs">
            <span className={cls("num", p.side === "BUY" ? "text-up" : "text-down")}>{fmtMarket(p.price, quoteCurrency)}</span>
            <span className="num text-right text-muted">{p.size}</span>
            <span className="num text-right text-muted/70">{new Date(p.ts).toLocaleTimeString([], { hour12: false })}</span>
          </div>
        ))}
        {prints.length === 0 && <div className="p-3 text-xs text-muted">Waiting for prints…</div>}
      </div>
    </div>
  );
}
