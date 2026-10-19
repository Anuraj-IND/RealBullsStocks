"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    ws.subscribeSymbols([symbol]);
  }, [symbol]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[272px_1fr_360px]">
        <aside className="hidden min-h-0 border-r border-line lg:block">
          <Watchlist />
        </aside>
        <main className="flex min-h-0 flex-col">
          <SymbolHeader />
          <div className="min-h-0 flex-1">
            <OrderBook rows={16} />
          </div>
        </main>
        <aside className="min-h-0 border-l border-line">
          <TradesTape />
        </aside>
      </div>
    </div>
  );
}
