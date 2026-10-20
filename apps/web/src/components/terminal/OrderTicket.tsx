"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { previewOrder } from "@realbulls/engine";
import type { OrderSide, OrderType } from "@realbulls/shared";
import { apiPost, ApiError } from "@/lib/api";
import { useAssets, useActiveAccount } from "@/lib/hooks";
import { useAccountStore, useSymbolStats, useUiStore, toast } from "@/lib/store";
import { useMoney } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";
import { assetMarketLabel, fmtAsOf, fmtPrice, cls, isDerivativeSegment } from "@/lib/format";

const RISK = { marginCallPct: 100, stopOutPct: 5 };

export function OrderTicket() {
  const symbol = useUiStore((s) => s.activeSymbol);
  const advanced = useUiStore((s) => s.advanced);
  const { tick } = useSymbolStats(symbol);
  const snapshot = useAccountStore((s) => s.snapshot);
  const account = useActiveAccount();
  const assetsQuery = useAssets();
  const qc = useQueryClient();
  const money = useMoney();

  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [lots, setLots] = useState("0.10");
  const [price, setPrice] = useState("");
  const [trigger, setTrigger] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const asset = assetsQuery.data?.assets.find((a) => a.symbol === symbol);

  const quickSide = useUiStore((s) => s.quickSide);
  const setQuickSide = useUiStore((s) => s.setQuickSide);
  useEffect(() => {
    if (!quickSide) return;
    setSide(quickSide);
    setLots(isDerivativeSegment(asset?.segment) ? "1" : "0.10");
    setType("MARKET");
    setQuickSide(null);
  }, [quickSide, asset, setQuickSide]);

  const balance = snapshot?.balance ?? account?.balance ?? 0;
  const marginUsed = snapshot?.marginUsed ?? account?.marginUsed ?? 0;
  const unrealized = snapshot?.unrealizedPnl ?? 0;

  const qty = parseFloat(lots) || 0;
  const lev = asset?.leverage && asset.leverage > 0 ? asset.leverage : 1;
  const liveMid = tick?.mid ?? asset?.mid;
  const hasLiveQuote = (tick?.mid ?? 0) > 0 || Boolean(asset && asset.quoteKind === "live" && (asset.mid ?? 0) > 0);
  const refPrice = type === "LIMIT" && price ? parseFloat(price) : liveMid ?? 0;

  const derivativeSegment = isDerivativeSegment(asset?.segment);
  const marketClosed = asset?.marketOpen === false;
  const closeOnly = asset?.quoteKind === "close";

  const preview = useMemo(() => {
    if (!asset) return null;
    const isDeriv = isDerivativeSegment(asset.segment);
    return previewOrder({
      side,
      qty,
      price: refPrice,
      contractSize: asset.contractSize,
      leverage: lev,
      commissionPerLot: isDeriv ? asset.commissionPerLot : 0,
      commissionPerOrder: isDeriv ? 0 : asset.commissionPerOrder,
      balance,
      unrealizedPnl: unrealized,
      marginUsed,
      marginCallPct: RISK.marginCallPct,
      stopOutPct: RISK.stopOutPct,
    });
  }, [asset, side, qty, refPrice, lev, balance, unrealized, marginUsed]);

  async function place() {
    if (!asset) return;
    setBusy(true);
    try {
      await apiPost("/orders", {
        assetId: asset.id,
        side,
        type,
        qty,
        price: type === "LIMIT" ? parseFloat(price) : undefined,
        triggerPrice: type === "STOP" ? parseFloat(trigger) : undefined,
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (type === "STOP") {
        toast.success("Stop-loss set", `${symbol} · closes your ${side} position when hit`);
      } else {
        toast.success(`${side} ${qty} ${symbol} ${type}`, "Order accepted");
      }
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
    } catch (err) {
      toast.error("Order rejected", err instanceof ApiError ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  if (!asset) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line bg-navy2/60 px-3 py-2">
          <div className="num truncate text-sm font-bold">{symbol}</div>
          <div className="truncate text-[11px] text-muted">
            {assetsQuery.isLoading ? "Loading instruments…" : "Not enabled for this account"}
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <span className="text-sm font-semibold">
            {assetsQuery.isLoading ? "Loading…" : `Trading is off for ${symbol}`}
          </span>
          {!assetsQuery.isLoading && (
            <p className="text-xs text-muted">
              This account&apos;s trading permissions don&apos;t include this market. Pick another symbol, or ask your
              admin to enable its segment.
            </p>
          )}
        </div>
        <div className="border-t border-line p-3">
          <button disabled className="w-full cursor-not-allowed border border-line py-3 text-sm font-bold text-muted">
            Not available
          </button>
        </div>
      </div>
    );
  }

  const isBuy = side === "BUY";
  const actionSide: OrderSide = type === "STOP" ? (isBuy ? "SELL" : "BUY") : side;
  const canSubmit =
    Boolean(asset) && !marketClosed && hasLiveQuote && qty > 0 && (preview ? preview.affordable : false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-navy2/60 px-3 py-2">
        <div className="min-w-0">
          <div className="num truncate text-sm font-bold">{symbol}</div>
          <div className="truncate text-[11px] text-muted">
            {marketClosed
              ? asset?.marketStatusReason ?? "Market closed"
              : closeOnly
                ? `Official NSE close${asset?.quoteAsOf ? ` · ${fmtAsOf(asset.quoteAsOf)}` : ""}`
                : asset?.name ?? "-"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-sm">{fmtPrice(liveMid)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {closeOnly ? "CLOSE" : assetMarketLabel(asset?.assetClass ?? "", asset?.segment)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-line">
        <button
          onClick={() => setSide("BUY")}
          className={cls("py-2.5 text-sm font-bold transition-colors", isBuy ? "bg-lime text-black" : "text-muted hover:text-ink")}
        >
          BUY / LONG
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={cls("py-2.5 text-sm font-bold transition-colors", !isBuy ? "bg-brand text-white" : "text-muted hover:text-ink")}
        >
          SELL / SHORT
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex gap-1">
          {(["MARKET", "LIMIT", "STOP"] as OrderType[]).map((t) => (
            <button key={t} onClick={() => setType(t)} className={cls("tab flex-1 justify-center px-2 py-1 text-xs", type === t && "tab-active")}>
              {t}
            </button>
          ))}
        </div>

        {type === "LIMIT" && (
          <Field label={`Limit price (${isBuy ? "below" : "above"} market)`}>
            <input className="input num" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={fmtPrice(liveMid)} />
          </Field>
        )}
        {type === "STOP" && (
          <>
            <Field label={`Stop-loss price (${isBuy ? "below" : "above"} market)`}>
              <input className="input num" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder={fmtPrice(liveMid)} />
            </Field>
            <p className="text-[11px] text-muted">
              Closes your <span className="text-ink">{side}</span> position when the price is hit.
            </p>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantity${derivativeSegment ? " (lots)" : ""}`}>
            <input className="input num" value={lots} onChange={(e) => setLots(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Leverage (set by admin)">
            <div className="input num flex items-center justify-between text-muted">
              <span>1:{lev}</span>
              <span className="text-[10px]">admin</span>
            </div>
          </Field>
        </div>

        {advanced && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stop loss">
              <input className="input num" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Take profit">
              <input className="input num" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="—" />
            </Field>
          </div>
        )}

        {preview && (
          <div className="panel-tight space-y-1.5 p-3 text-xs">
            <Row label="Notional" value={money.fmt(preview.notional)} />
            <Row label="Required margin" value={money.fmt(preview.requiredMargin)} />
            <Row label="Free margin after" value={money.fmt(preview.freeMarginAfter)} tone={preview.freeMarginAfter >= 0 ? "up" : "down"} />
            {!preview.affordable && <div className="pt-1 text-brandbright">Insufficient margin for this size.</div>}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        {marketClosed && (
          <p className="mb-2 text-[11px] text-brandbright">{asset.marketStatusReason ?? "Market is closed for this instrument."}</p>
        )}
        {!marketClosed && closeOnly && (
          <p className="mb-2 text-[11px] text-muted">
            Display-only official NSE close{asset.quoteAsOf ? ` as of ${fmtAsOf(asset.quoteAsOf)}` : ""}; a live quote is
            required to place orders.
          </p>
        )}
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={busy || !canSubmit}
          className={cls("w-full py-3 text-sm font-bold", actionSide === "BUY" ? "btn-buy" : "btn-sell")}
        >
          {marketClosed ? "Market closed" : closeOnly ? "No live quote" : busy ? "Placing." : `${actionSide} ${qty || ""} ${symbol}`}
        </button>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title={type === "STOP" ? "Confirm stop-loss" : `Confirm ${side} order`}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={place}
          busy={busy}
          rows={[
            ["Instrument", symbol],
            ["Order type", type === "STOP" ? "STOP-LOSS" : type],
            ["Direction", side],
            ...(type === "STOP" ? [["Action", `Closes your ${side} position`] as [string, string]] : []),
            ...(type === "LIMIT" ? [["Limit price", price] as [string, string]] : []),
            ...(type === "STOP" ? [["Stop-loss price", trigger] as [string, string]] : []),
            ["Quantity", `${qty}${derivativeSegment ? " lots" : ""}`],
            ["Leverage", `1:${lev} (admin)`],
            ["Est. margin", preview ? money.fmt(preview.requiredMargin) : "—"],
          ]}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  rows,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  rows: Array<[string, string]>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm border border-line bg-navy2 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display mb-3 text-base font-bold">{title}</h3>
        <div className="space-y-1.5 border border-line bg-navy p-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-muted">{k}</span>
              <span className="num font-medium text-ink">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? "Placing…" : "Confirm"}
          </button>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "up" | "down" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={cls("num font-medium", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink")}>{value}</span>
    </div>
  );
}
