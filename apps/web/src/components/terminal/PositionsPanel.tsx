"use client";

import { useState } from "react";
import { cls, fmtPrice } from "@/lib/format";
import { useMoney } from "@/lib/money";
import { usePositions, useOrders, usePositionHistory, useLedger, useClosePosition, useCloseAll, useCancelOrder } from "@/lib/hooks";
import { useUiStore } from "@/lib/store";

type Tab = "positions" | "orders" | "history" | "ledger";

export function PositionsPanel() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const positions = usePositions();
  const orders = useOrders();
  const history = usePositionHistory();
  const ledger = useLedger();
  const closePosition = useClosePosition();
  const closeAll = useCloseAll();
  const cancelOrder = useCancelOrder();
  const money = useMoney();
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => void } | null>(null);

  const summary = positions.data?.summary;
  const open = positions.data?.positions ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-2">
        <div className="flex items-center">
          {(["positions", "orders", "history", "ledger"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cls("tab capitalize", tab === t && "tab-active")}>
              {t}
              {t === "positions" && open.length > 0 && <span className="ml-1 text-amber">({open.length})</span>}
              {t === "orders" && (orders.data?.orders.length ?? 0) > 0 && <span className="ml-1 text-amber">({orders.data?.orders.length})</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 pr-2">
          {summary && (
            <div className="hidden items-center gap-3 text-xs sm:flex">
              <span className="text-muted">Day P&L</span>
              <span className={cls("num font-semibold", (summary.dayPnl ?? 0) >= 0 ? "text-up" : "text-down")}>{money.signed(summary.dayPnl ?? 0)}</span>
              <span className="text-muted">Unrealized</span>
              <span className={cls("num font-semibold", summary.unrealizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(summary.unrealizedPnl)}</span>
              <span className="text-muted">Margin</span>
              <span className="num">{money.fmt(summary.marginUsed)}</span>
            </div>
          )}
          {open.length > 0 && (
            <button
              onClick={() =>
                setConfirm({
                  title: "Close all positions",
                  message: `Close all ${open.length} open position(s) at market?`,
                  run: () => closeAll.mutate(),
                })
              }
              className="btn-ghost py-1 text-xs"
              disabled={closeAll.isPending}
            >
              Close all
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "positions" && (
          <Table head={["Symbol", "Side", "Qty", "Entry", "Mark", "Margin", "Unrealized", ""]}>
            {open.map((p) => (
              <tr key={p.id} className="border-b border-line/60 hover:bg-slate/30">
                <Td className="num font-semibold">{p.symbol}</Td>
                <Td>
                  <span className={cls("badge", p.side === "BUY" ? "bg-lime/15 text-lime" : "bg-brand/15 text-brandbright")}>{p.side}</span>
                </Td>
                <Td className="num">{p.qty}</Td>
                <Td className="num">{fmtPrice(p.avgEntryPrice)}</Td>
                <Td className="num">{fmtPrice(p.markPrice)}</Td>
                <Td className="num">{money.fmt(p.marginUsed)}</Td>
                <Td className={cls("num font-semibold", p.unrealizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(p.unrealizedPnl)}</Td>
                <Td className="text-right">
                  <button
                    onClick={() =>
                      setConfirm({
                        title: `Close ${p.symbol}`,
                        message: `Close ${p.side} ${p.qty} ${p.symbol} at market?`,
                        run: () => closePosition.mutate({ id: p.id }),
                      })
                    }
                    className="btn-ghost py-1 text-xs"
                  >
                    Close
                  </button>
                </Td>
              </tr>
            ))}
            {open.length === 0 && <EmptyRow cols={8} text="No open positions" />}
          </Table>
        )}

        {tab === "orders" && (
          <Table head={["Symbol", "Side", "Type", "Qty", "Price", "Status", ""]}>
            {(orders.data?.orders ?? []).map((o) => (
              <tr key={o.id} className="border-b border-line/60 hover:bg-slate/30">
                <Td className="num font-semibold">{o.symbol}</Td>
                <Td className={o.side === "BUY" ? "text-up" : "text-down"}>{o.side}</Td>
                <Td>{o.kind === "SL" ? "STOP-LOSS" : o.kind === "TP" ? "TAKE-PROFIT" : o.type}</Td>
                <Td className="num">{o.qty}</Td>
                <Td className="num">{fmtPrice(o.price ?? o.triggerPrice)}</Td>
                <Td><span className="badge bg-amber/15 text-amber">{o.status}</span></Td>
                <Td className="text-right">
                  <button
                    onClick={() =>
                      setConfirm({
                        title: "Cancel order",
                        message: `Cancel pending ${o.side} ${o.qty} ${o.symbol}?`,
                        run: () => cancelOrder.mutate(o.id),
                      })
                    }
                    className="btn-ghost py-1 text-xs"
                  >
                    Cancel
                  </button>
                </Td>
              </tr>
            ))}
            {(orders.data?.orders.length ?? 0) === 0 && <EmptyRow cols={7} text="No pending orders" />}
          </Table>
        )}

        {tab === "history" && (
          <Table head={["Symbol", "Side", "Qty", "Entry", "Exit", "Brokerage", "Realized", "Net P&L", "Closed"]}>
            {(history.data?.positions ?? []).map((p) => {
              const net = p.realizedPnl - (p.commission ?? 0);
              return (
                <tr key={p.id} className="border-b border-line/60 hover:bg-slate/30">
                  <Td className="num font-semibold">{p.symbol}</Td>
                  <Td className={p.side === "BUY" ? "text-up" : "text-down"}>{p.side}</Td>
                  <Td className="num">{p.qty}</Td>
                  <Td className="num">{fmtPrice(p.avgEntryPrice)}</Td>
                  <Td className="num">{fmtPrice(p.closedPrice)}</Td>
                  <Td className="num text-muted">{money.fmt(p.commission ?? 0)}</Td>
                  <Td className={cls("num", p.realizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(p.realizedPnl)}</Td>
                  <Td className={cls("num font-semibold", net >= 0 ? "text-up" : "text-down")}>{money.signed(net)}</Td>
                  <Td className="num text-xs text-muted">{p.closedAt ? new Date(p.closedAt).toLocaleString() : "—"}</Td>
                </tr>
              );
            })}
            {(history.data?.positions.length ?? 0) === 0 && <EmptyRow cols={9} text="No closed trades yet" />}
          </Table>
        )}

        {tab === "ledger" && (
          <Table head={["Time", "Type", "Direction", "Amount", "Balance", "Memo"]}>
            {(ledger.data?.entries ?? []).map((e) => (
              <tr key={e.id} className="border-b border-line/60 hover:bg-slate/30">
                <Td className="num text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</Td>
                <Td>{e.type === "COMMISSION" ? "BROKERAGE" : e.type}</Td>
                <Td>
                  <span className={cls("badge", e.direction === "CREDIT" ? "bg-lime/15 text-lime" : "bg-brand/15 text-brandbright")}>{e.direction}</span>
                </Td>
                <Td className="num">{money.fmt(e.amount)}</Td>
                <Td className="num">{money.fmt(e.balanceAfter)}</Td>
                <Td className="text-xs text-muted">{e.memo ?? "—"}</Td>
              </tr>
            ))}
            {(ledger.data?.entries.length ?? 0) === 0 && <EmptyRow cols={6} text="No ledger entries" />}
          </Table>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display mb-2 text-base font-bold">{confirm.title}</h3>
            <p className="mb-4 text-sm text-muted">{confirm.message}</p>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  confirm.run();
                  setConfirm(null);
                }}
              >
                Confirm
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead className="sticky top-0 z-10 bg-navy2 text-[11px] uppercase tracking-wider text-muted">
        <tr>
          {head.map((h, i) => (
            <th key={i} className="border-b border-line px-3 py-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cls("px-3 py-2", className)}>{children}</td>;
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-muted">
        {text}
      </td>
    </tr>
  );
}
