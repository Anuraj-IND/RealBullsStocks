"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { TopBar, useEnsureSession } from "@/components/terminal/TopBar";
import { Ticker } from "@/components/terminal/Ticker";
import { AccountBar } from "@/components/terminal/AccountBar";
import { Watchlist } from "@/components/terminal/Watchlist";
import { SymbolHeader } from "@/components/terminal/SymbolHeader";
import { Chart } from "@/components/terminal/Chart";
import { OrderTicket } from "@/components/terminal/OrderTicket";
import { PositionsPanel } from "@/components/terminal/PositionsPanel";
import { useAssets } from "@/lib/hooks";
import { useAuthStore, useUiStore } from "@/lib/store";
import { cls } from "@/lib/format";

const TAPE = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT",
  "NIFTY50", "BANKNIFTY", "FINNIFTY",
  "RELIANCE", "TCS", "HDFCBANK",
];

export default function TerminalPage() {
  useEnsureSession();
  const advanced = useUiStore((s) => s.advanced);
  const mobileTab = useUiStore((s) => s.mobileTab);
  const setMobileTab = useUiStore((s) => s.setMobileTab);
  const symbol = useUiStore((s) => s.activeSymbol);
  const setActiveSymbol = useUiStore((s) => s.setActiveSymbol);
  const assetsQuery = useAssets();
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current || assetsQuery.isLoading) return;
    const list = assetsQuery.data?.assets;
    if (!list || list.length === 0) return;
    bootstrapped.current = true;
    const current = list.find((a) => a.symbol === symbol);
    if (!current) setActiveSymbol(list[0]!.symbol);
  }, [assetsQuery.data, assetsQuery.isLoading, symbol, setActiveSymbol]);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      {advanced && <Ticker symbols={TAPE} />}
      <AccountBar />

      <div className="hidden min-h-0 flex-1 grid-cols-[400px_minmax(0,7fr)_minmax(0,3fr)] overflow-x-hidden lg:grid">
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-line">
          <div className="min-h-0 flex-1">
            <Watchlist />
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          <SymbolHeader />
          <div className="min-h-0 flex-[1.15]">
            <Chart />
          </div>
          <div className="min-h-[230px] flex-1 border-t border-line">
            <PositionsPanel />
          </div>
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col border-l border-line">
          <div className="min-h-0 flex-1">
            <OrderTicket />
          </div>
        </aside>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          {mobileTab === "watchlist" && <Watchlist />}
          {mobileTab === "chart" && (
            <div className="flex h-full flex-col">
              <SymbolHeader />
              <div className="min-h-0 flex-1">
                <Chart />
              </div>
              <button
                onClick={() => setMobileTab("trade")}
                className="shrink-0 border-t border-line bg-accent py-3 text-sm font-bold text-navy"
              >
                Trade {symbol}
              </button>
            </div>
          )}
          {mobileTab === "trade" && (
            <div className="flex h-full min-h-0 flex-col">
              <OrderTicket />
            </div>
          )}
          {mobileTab === "positions" && <PositionsPanel />}
        </div>

        <nav className={cls("grid border-t border-line bg-navy2 pb-[env(safe-area-inset-bottom)]", isAdmin ? "grid-cols-5" : "grid-cols-4")}>
          {(
            [
              ["watchlist", "Watchlist", "M4 6h16M4 12h16M4 18h16"],
              ["chart", "Chart", "M4 19h16M7 16V9M12 16V5M17 16v-4"],
              ["trade", "Trade", "M8 9l4-4 4 4M8 15l4 4 4-4"],
              ["positions", "Positions", "M3 7h18v12H3zM8 7V5h8v2"],
            ] as Array<[typeof mobileTab, string, string]>
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setMobileTab(id)}
              className={cls(
                "flex min-h-[58px] flex-col items-center justify-center gap-1 py-2 text-[13px] font-semibold transition-colors",
                mobileTab === id ? "border-t-2 border-accent bg-accent/10 text-accent" : "border-t-2 border-transparent text-muted",
              )}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={icon} />
              </svg>
              {label}
            </button>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className="flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-2 border-transparent py-2 text-[13px] font-semibold text-muted transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
                <path d="M9.5 12l1.8 1.8L15 10" />
              </svg>
              Admin
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
