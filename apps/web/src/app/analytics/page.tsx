"use client";

import { TopBar, useEnsureSession } from "@/components/terminal/TopBar";
import { Card, Stat } from "@/components/ui/Card";
import { cls, fmtPrice } from "@/lib/format";
import { useMoney } from "@/lib/money";
import { useAnalytics } from "@/lib/hooks";

export default function AnalyticsPage() {
  useEnsureSession();
  const { data, isLoading } = useAnalytics();
  const money = useMoney();

  const curve = data?.equityCurve ?? [];
  const points = buildSparkline(curve.map((p) => p.equity));

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">
            Performance <span className="text-accent">Analytics</span>
          </h1>
          <span className="text-xs text-muted">{data?.totalTrades ?? 0} closed trades</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Win rate" value={data ? `${data.winRate.toFixed(1)}%` : "—"} tone="amber" />
          <Stat label="Net P&L" value={money.signed(data?.netPnl ?? 0)} tone={(data?.netPnl ?? 0) >= 0 ? "up" : "down"} />
          <Stat label="Profit factor" value={data?.profitFactor === null || data?.profitFactor === undefined ? "—" : data.profitFactor.toFixed(2)} />
          <Stat label="Wins / Losses" value={`${data?.wins ?? 0} / ${data?.losses ?? 0}`} />
          <Stat label="Gross profit" value={money.fmt(data?.grossProfit ?? 0)} tone="up" />
          <Stat label="Max drawdown" value={money.fmt(data?.maxDrawdown ?? 0)} tone="down" />
        </div>

        <Card title="Equity curve">
          {isLoading ? (
            <div className="p-8 text-center text-muted">Loading…</div>
          ) : curve.length < 2 ? (
            <div className="p-8 text-center text-muted">Not enough closed trades to plot an equity curve yet.</div>
          ) : (
            <div className="relative">
              <svg viewBox="0 0 600 180" className="h-48 w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5CA7FF" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#5CA7FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline fill="none" stroke="#5CA7FF" strokeWidth="2" points={points.line} />
                <polygon fill="url(#eq)" points={points.area} />
              </svg>
              <div className="flex justify-between px-1 text-[11px] text-muted">
                <span className="num">{new Date(curve[0]!.time).toLocaleDateString()}</span>
                <span className="num">{new Date(curve[curve.length - 1]!.time).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </Card>

        <Card title="Daily P&L">
          {(data?.dailyPnl ?? []).length === 0 ? (
            <div className="p-6 text-center text-muted">No closed trades yet.</div>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-navy2 text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    {["Date", "Trades", "Realized P&L"].map((h) => (
                      <th key={h} className="border-b border-line px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.dailyPnl.map((d) => (
                    <tr key={d.date} className="border-b border-line/60 hover:bg-slate/30">
                      <td className="num px-3 py-2">{d.date}</td>
                      <td className="num px-3 py-2">{d.trades}</td>
                      <td className={cls("num px-3 py-2 font-semibold", d.pnl >= 0 ? "text-up" : "text-down")}>{money.signed(d.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Trade log">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  {["Opened", "Side", "Qty", "Entry", "Exit", "Realized", "Result"].map((h) => (
                    <th key={h} className="border-b border-line px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.tradeLog ?? []).map((t) => (
                  <tr key={t.id} className="border-b border-line/60 hover:bg-slate/30">
                    <td className="num px-3 py-2 text-xs text-muted">{t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}</td>
                    <td className={cls("px-3 py-2", t.side === "BUY" ? "text-up" : "text-down")}>{t.side}</td>
                    <td className="num px-3 py-2">{t.qty}</td>
                    <td className="num px-3 py-2">{fmtPrice(t.entry)}</td>
                    <td className="num px-3 py-2">{fmtPrice(t.exit)}</td>
                    <td className={cls("num px-3 py-2 font-semibold", t.realizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(t.realizedPnl)}</td>
                    <td className="px-3 py-2">
                      <span className={cls("badge", t.realizedPnl >= 0 ? "bg-lime/15 text-lime" : "bg-brand/15 text-brandbright")}>
                        {t.realizedPnl >= 0 ? "WIN" : "LOSS"}
                      </span>
                    </td>
                  </tr>
                ))}
                {(data?.tradeLog ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted">
                      No closed trades yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}

function buildSparkline(values: number[]): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const w = 600;
  const h = 180;
  const pad = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pts[0]![0]},${h} ${line} ${pts[pts.length - 1]![0]},${h}`;
  return { line, area };
}
