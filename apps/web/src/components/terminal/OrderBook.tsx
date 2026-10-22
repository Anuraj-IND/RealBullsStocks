"use client";

import { cls, fmtMarket } from "@/lib/format";
import { useSymbolStats, useUiStore } from "@/lib/store";
import { useQuoteCurrency } from "@/lib/hooks";

const DEFAULT_ROWS = 8;


function sizeAt(mid: number, i: number, side: number): number {
  const seed = Math.sin(mid * 977 + i * 12.9898 + side * 78.233) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return Math.round(20 + frac * 880);
}

export function OrderBook({ rows = DEFAULT_ROWS, showHeader = true }: { rows?: number; showHeader?: boolean }) {
  const symbol = useUiStore((s) => s.activeSymbol);
  const { tick } = useSymbolStats(symbol);
  const quoteCurrency = useQuoteCurrency(symbol);

  if (!tick) return <div className="p-3 text-xs text-muted">Loading book…</div>;

  const mid = tick.mid;
  const step = Math.max(tick.ask - tick.bid, mid * 0.00004);
  const asks = Array.from({ length: rows }, (_, i) => {
    const level = rows - i;
    return { price: mid + step * level, size: sizeAt(mid, i, 1) };
  });
  const bids = Array.from({ length: rows }, (_, i) => {
    const level = i + 1;
    return { price: mid - step * level, size: sizeAt(mid, i, 2) };
  });
  const maxSize = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size));

  return (
    <div className="flex h-full flex-col">
      {showHeader && (
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Order Book</span>
          <span className="num text-[11px] text-muted">spread {fmtMarket(tick.ask - tick.bid, quoteCurrency)}</span>
        </div>
      )}
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] uppercase tracking-wider text-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Cum.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {asks.map((a) => (
          <Row key={`a${a.price}`} price={a.price} size={a.size} maxSize={maxSize} side="ask" quoteCurrency={quoteCurrency} />
        ))}
        <div className="my-1 flex items-center justify-between border-y border-line bg-navy2 px-3 py-1">
          <span className="num text-sm font-semibold text-ink">{fmtMarket(mid, quoteCurrency)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted">mid</span>
        </div>
        {bids.map((b) => (
          <Row key={`b${b.price}`} price={b.price} size={b.size} maxSize={maxSize} side="bid" quoteCurrency={quoteCurrency} />
        ))}
      </div>
    </div>
  );
}

function Row({ price, size, maxSize, side, quoteCurrency }: { price: number; size: number; maxSize: number; side: "ask" | "bid"; quoteCurrency?: string }) {
  const pct = (size / maxSize) * 100;
  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-xs">
      <div
        className={cls("absolute inset-y-0 right-0", side === "ask" ? "bg-brand/15" : "bg-lime/10")}
        style={{ width: `${pct}%` }}
      />
      <span className={cls("num relative", side === "ask" ? "text-down" : "text-up")}>{fmtMarket(price, quoteCurrency)}</span>
      <span className="num relative text-right text-muted">{size}</span>
      <span className="num relative text-right text-muted/70">{Math.round(size * 1.4)}</span>
    </div>
  );
}
