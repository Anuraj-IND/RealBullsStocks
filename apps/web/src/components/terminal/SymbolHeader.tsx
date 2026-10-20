"use client";

import { useEffect, useRef, useState } from "react";
import { assetMarketLabel, cls, fmtAsOf, fmtPrice } from "@/lib/format";
import { useSymbolStats, useUiStore } from "@/lib/store";
import { useAssets } from "@/lib/hooks";

export function SymbolHeader() {
  const symbol = useUiStore((s) => s.activeSymbol);
  const { tick, changePct } = useSymbolStats(symbol);
  const assets = useAssets();
  const asset = assets.data?.assets.find((a) => a.symbol === symbol);

  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevMid = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!tick) return;
    const p = prevMid.current;
    if (p !== undefined && tick.mid !== p) {
      setFlash(tick.mid > p ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 450);
      prevMid.current = tick.mid;
      return () => clearTimeout(t);
    }
    prevMid.current = tick.mid;
  }, [tick]);

  const up = changePct >= 0;
  const mid = tick?.mid ?? asset?.mid;
  const bid = tick?.bid ?? asset?.bid;
  const ask = tick?.ask ?? asset?.ask;
  const spread = bid !== undefined && ask !== undefined ? ask - bid : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-navy2/60 px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center bg-slate2 text-[10px] font-bold text-accent">
          {symbol.slice(0, 2)}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[15px] font-bold">{symbol}</span>
            {asset && <span className="badge bg-slate2 text-muted">{assetMarketLabel(asset.assetClass, asset.segment)}</span>}
            {asset?.marketOpen === false && (
              <span className="badge bg-brand/15 text-brandbright" title={asset.marketStatusReason}>
                CLOSED
              </span>
            )}
            {asset?.quoteKind === "close" && (
              <span
                className="badge bg-slate2 text-muted"
                title={`Official NSE closing price${asset.quoteAsOf ? ` as of ${fmtAsOf(asset.quoteAsOf)}` : ""}`}
              >
                CLOSE {asset.quoteAsOf ? fmtAsOf(asset.quoteAsOf) : ""}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted">{asset?.name ?? "—"}</div>
          {asset?.marketOpen === false && asset.marketStatusReason && (
            <div className="truncate text-[10px] text-brandbright">{asset.marketStatusReason}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className={cls("num text-xl font-bold", flash === "up" ? "text-up" : flash === "down" ? "text-down" : "text-ink")}>
            {fmtPrice(mid)}
          </div>
          <div className={cls("num text-xs", up ? "text-up" : "text-down")}>
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
        </div>
        <Stat label="Bid" value={fmtPrice(bid)} tone="down" />
        <Stat label="Ask" value={fmtPrice(ask)} tone="up" />
        <Stat label="Spread" value={fmtPrice(spread)} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="hidden text-right sm:block">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cls("num text-sm", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink")}>{value}</div>
    </div>
  );
}
