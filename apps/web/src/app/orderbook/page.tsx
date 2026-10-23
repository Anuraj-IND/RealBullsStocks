"use client";

import { useEffect, useState } from "react";
import { TopBar, useEnsureSession } from "@/components/terminal/TopBar";
import { Watchlist } from "@/components/terminal/Watchlist";
import { SymbolHeader } from "@/components/terminal/SymbolHeader";
import { OrderBook } from "@/components/terminal/OrderBook";
import { TradesTape } from "@/components/terminal/TradesTape";
import { useUiStore } from "@/lib/store";
import { ws } from "@/lib/ws";

export default function OrderBookPage() {
  useEnsureSession();
  const symbol = useUiStore((s) => s.activeSymbol);
  const [mobileView, setMobileView] = useState<"markets" | "book" | "tape">("book");

  useEffect(() => {
    setMobileView("book");
  }, [symbol]);

  useEffect(() => {
    ws.subscribeSymbols([symbol]);
  }, [symbol]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
        <aside className="hidden min-h-0 min-w-0 border-r border-line lg:block">
          <Watchlist />
        </aside>
        <main className="flex min-h-0 flex-col">
          <SymbolHeader />
          <div className="flex gap-1 border-b border-line px-3 py-1.5 lg:hidden">
            {(
              [
                ["markets", "Markets"],
                ["book", "Order Book"],
                ["tape", "Time & Sales"],
              ] as const
            ).map((v) => (
              <button
                key={v[0]}
                onClick={() => setMobileView(v[0])}
                className={`tab flex-1 justify-center capitalize ${mobileView === v[0] ? "tab-active" : ""}`}
              >
                {v[1]}
              </button>
            ))}
          </div>
          <div className={mobileView === "markets" ? "min-h-0 flex-1 lg:hidden" : "hidden"}>
            <Watchlist />
          </div>
          <div className={mobileView === "book" ? "min-h-0 flex-1" : "hidden lg:block lg:flex-1"}>
            <OrderBook rows={16} />
          </div>
        </main>
        <aside className={`min-h-0 border-t border-line lg:border-l lg:border-t-0 ${mobileView === "tape" ? "" : "hidden lg:block"}`}>
          <TradesTape />
        </aside>
      </div>
    </div>
  );
}
