"use client";

import { useEffect, useMemo, useState } from "react";
import { cls, fmtPrice } from "@/lib/format";
import { useMarketStore } from "@/lib/store";
import { ws } from "@/lib/ws";


export function Ticker({ symbols }: { symbols: string[] }) {
  const ticks = useMarketStore((s) => s.ticks);
  const prev = useMarketStore((s) => s.prev);
  const [ready, setReady] = useState(false);

  const key = useMemo(() => symbols.join(","), [symbols]);

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length) ws.subscribeSymbols(list);
    setReady(true);
    return () => {
      if (list.length) ws.unsubscribeSymbols(list);
    };
  }, [key]);

  if (!ready || symbols.length === 0) return <div className="h-9 border-b border-line bg-navy2/60" />;

  const items = [...symbols, ...symbols];

  return (
    <div className="relative h-9 overflow-hidden border-b border-line bg-navy2/60">
      <div className="flex h-full items-center gap-6 whitespace-nowrap px-4 [animation:marquee_45s_linear_infinite]">
        {items.map((symbol, i) => {
          const t = ticks[symbol];
          const p = prev[symbol];
          const chg = t && p ? ((t.mid - p) / p) * 100 : 0;
          return (
            <span key={`${symbol}-${i}`} className="inline-flex items-center gap-2 text-xs">
              <span className="num font-semibold text-ink/90">{symbol}</span>
              <span className="num text-muted">{fmtPrice(t?.mid)}</span>
              <span className={cls("num", chg >= 0 ? "text-up" : "text-down")}>
                {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
