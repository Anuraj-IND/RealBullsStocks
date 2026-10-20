"use client";

import { useEffect, useMemo, useState } from "react";
import { assetMarketLabel, cls, fmtPrice, isDerivativeSegment } from "@/lib/format";
import {
  useAssets,
  useWatchlist,
  useAddWatchlistItem,
  useRemoveWatchlistItem,
  useCreateWatchlist,
  useRenameWatchlist,
  useDeleteWatchlist,
  useInstrumentSearch,
  type InstrumentResult,
} from "@/lib/hooks";
import { useMarketStore, useSymbolStats, useUiStore, toast } from "@/lib/store";
import { ws } from "@/lib/ws";
import { apiPost, ApiError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const PRESETS = ["Equity", "Futures", "Options", "Commodities", "Crypto", "Forex"];

function assetKindRank(segment?: string): number {
  const s = (segment ?? "").toUpperCase();
  if (s.includes("FUT")) return 1;
  if (s.includes("OPT")) return 2;
  return 0;
}

function instrumentContract(r: InstrumentResult): string {
  if (r.instrumentType === "FUT") return "Futures";
  return `${r.strike > 0 ? r.strike : ""} ${r.optionType ?? r.instrumentType}`.trim();
}

function expiryBadge(iso: string | null, exchange: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + 7);
  const monthly = next.getUTCMonth() !== d.getUTCMonth();
  return `${day} ${month} ${monthly ? "MONTHLY" : "WEEKLY"}`;
}

const CATEGORIES = [
  { id: "ALL", label: "All" },
  { id: "FOREX", label: "Forex" },
  { id: "CRYPTO", label: "Crypto" },
  { id: "STOCK", label: "Stocks" },
  { id: "INDEX", label: "Indices" },
  { id: "COMMODITY", label: "Commodities" },
] as const;

export function Watchlist() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("ALL");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const watchlistsQuery = useWatchlist();
  const assetsQuery = useAssets();
  const addItem = useAddWatchlistItem();
  const removeItem = useRemoveWatchlistItem();
  const createList = useCreateWatchlist();
  const renameList = useRenameWatchlist();
  const deleteList = useDeleteWatchlist();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const searchEnabled = debouncedQuery.trim().length >= 1;
  const instrumentSearch = useInstrumentSearch(debouncedQuery, { enabled: searchEnabled });
  const instrumentResults = searchEnabled ? instrumentSearch.data?.instruments ?? [] : [];

  const activeSymbol = useUiStore((s) => s.activeSymbol);
  const setActiveSymbol = useUiStore((s) => s.setActiveSymbol);
  const setMobileTab = useUiStore((s) => s.setMobileTab);
  const advanced = useUiStore((s) => s.advanced);
  const qc = useQueryClient();
  const [quick, setQuick] = useState<{ symbol: string; side: "BUY" | "SELL" } | null>(null);
  const [quickQty, setQuickQty] = useState("0.1");
  const [placing, setPlacing] = useState(false);

  const selectSymbol = (symbol: string) => {
    setActiveSymbol(symbol);
    setMobileTab("chart");
  };

  const availableSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const a of assetsQuery.data?.assets ?? []) set.add(a.symbol);
    return set;
  }, [assetsQuery.data]);

  const openQuick = (symbol: string, side: "BUY" | "SELL") => {
    const asset = assetsQuery.data?.assets.find((a) => a.symbol === symbol);
    if (asset?.marketOpen === false) {
      toast.error("Market closed", asset.marketStatusReason ?? "This instrument is not trading right now");
      return;
    }
    if (asset && asset.quoteKind !== "live") {
      toast.error("No live quote", "Trading requires a live price; this is a closing price");
      return;
    }
    setQuickQty(isDerivativeSegment(asset?.segment) ? "1" : "0.1");
    setQuick({ symbol, side });
    setActiveSymbol(symbol);
  };

  const submitQuick = async () => {
    if (!quick) return;
    const asset = assetsQuery.data?.assets.find((a) => a.symbol === quick.symbol);
    if (!asset) {
      toast.error("Not ready", "Asset data is still loading");
      return;
    }
    if (asset.quoteKind !== "live") {
      toast.error("No live quote", "Trading requires a live price; this is a closing price");
      return;
    }
    const qty = parseFloat(quickQty);
    if (!qty || qty <= 0) {
      toast.error("Enter a quantity");
      return;
    }
    setPlacing(true);
    try {
      await apiPost("/orders", {
        assetId: asset.id,
        side: quick.side,
        type: "MARKET",
        qty,
        idempotencyKey: crypto.randomUUID(),
      });
      toast.success(`${quick.side} ${qty} ${quick.symbol}`, "Market order filled");
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setQuick(null);
    } catch (err) {
      toast.error("Order rejected", err instanceof ApiError ? err.message : "Unknown error");
    } finally {
      setPlacing(false);
    }
  };

  const watchlists = watchlistsQuery.data?.watchlists ?? [];

  useEffect(() => {
    if (!activeId && watchlists.length > 0) setActiveId(watchlists[0]!.id);
    if (activeId && watchlists.length > 0 && !watchlists.some((w) => w.id === activeId)) setActiveId(watchlists[0]!.id);
  }, [watchlists, activeId]);

  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0];
  const items = active?.items ?? [];
  const symbolKey = items.map((i) => i.symbol).join(",");

  useEffect(() => {
    const list = symbolKey ? symbolKey.split(",") : [];
    if (list.length) ws.subscribeSymbols(list);
    return () => {
      if (list.length) ws.unsubscribeSymbols(list);
    };
  }, [symbolKey]);

  const ql = debouncedQuery.trim().toLowerCase();
  const symbolPrefix = (a: { symbol: string }) => (a.symbol.toLowerCase().startsWith(ql) ? 0 : 1);
  const localExtras = searchEnabled
    ? (assetsQuery.data?.assets ?? [])
        .filter((a) => ql.length > 0 && assetKindRank(a.segment) === 0)
        .filter((a) => a.symbol.toLowerCase().startsWith(ql) || a.name.toLowerCase().startsWith(ql))
        .filter((a) => !instrumentResults.some((r) => r.tradingsymbol === a.symbol))
        .sort((a, b) => symbolPrefix(a) - symbolPrefix(b))
        .slice(0, 5)
    : [];
  const showResults = searchEnabled && (instrumentResults.length > 0 || localExtras.length > 0);

  const searchRows = [
    ...localExtras.map((asset) => ({ kind: "asset" as const, asset, rank: assetKindRank(asset.segment) })),
    ...instrumentResults.map((instrument) => ({
      kind: "instrument" as const,
      instrument,
      rank: instrument.instrumentType === "FUT" ? 1 : 2,
    })),
  ].sort((x, y) => x.rank - y.rank);

  const filtered = items.filter((i) => category === "ALL" || i.assetClass === category);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    const res = await createList.mutateAsync(name);
    setActiveId(res.id);
    setNewName("");
    setCreating(false);
    toast.success("Watchlist created", name);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
          {watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveId(w.id);
                setEditing(false);
              }}
              className={cls(
                "whitespace-nowrap rounded-none border px-2 py-1 text-xs transition-colors",
                w.id === active?.id ? "border-accent text-accent" : "border-line text-muted hover:text-ink",
              )}
            >
              {w.name}
            </button>
          ))}
          <button
            onClick={() => {
              setCreating((v) => !v);
              setEditing(false);
            }}
            className="whitespace-nowrap border border-dashed border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
            title="New watchlist"
          >
            + New
          </button>
        </div>

        {creating && (
          <div className="space-y-2 border-t border-line bg-navy2/60 p-2">
            <div className="flex gap-2">
              <input
                className="input py-1 text-xs"
                autoFocus
                placeholder="List name (e.g. Options)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <button className="btn-primary py-1 text-xs" onClick={create} disabled={createList.isPending}>
                Create
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => setNewName(p)} className="chip">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {active && editing && (
          <div className="flex gap-2 border-t border-line bg-navy2/60 p-2">
            <input className="input py-1 text-xs" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} />
            <button
              className="btn-primary py-1 text-xs"
              onClick={() => {
                if (editName.trim()) renameList.mutate({ id: active.id, name: editName.trim() });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <input
            className="input py-1.5 text-sm"
            placeholder="Search markets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {active && (
            <div className="flex shrink-0 gap-1">
              <button
                className="btn-ghost px-2 py-1 text-xs"
                title="Rename list"
                onClick={() => {
                  setEditing((v) => !v);
                  setEditName(active.name);
                }}
              >
                ✎
              </button>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                title="Delete list"
                onClick={() => {
                  if (watchlists.length <= 1) return toast.error("Keep at least one watchlist");
                  deleteList.mutate(active.id);
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {searchEnabled && instrumentSearch.isLoading && instrumentResults.length === 0 && (
          <div className="px-2 py-1 text-xs text-muted">Searching…</div>
        )}

        {showResults && (
          <div className="max-h-72 space-y-0.5 overflow-y-auto border border-line bg-navy2 p-1">
            {searchRows.map((row) => {
              if (row.kind === "instrument") {
                const r = row.instrument;
                const already = items.some((i) => i.symbol === r.tradingsymbol);
                const badge = expiryBadge(r.expiry, r.exchange);
                return (
                  <button
                    key={r.instrumentToken}
                    onClick={() => {
                      if (already) {
                        setQuery("");
                        return;
                      }
                      addItem.mutate(
                        { instrumentToken: r.instrumentToken, watchlistId: active?.id },
                        { onSuccess: () => setQuery("") },
                      );
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cls("shrink-0", already ? "text-accent" : "text-green")}>{already ? "✓" : "+"}</span>
                      <span className="truncate font-medium text-ink">{r.underlying}</span>
                      <span className="num shrink-0 text-xs text-muted">{instrumentContract(r)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
                      {badge && <span>{badge}</span>}
                      <span className="chip">{r.exchange}</span>
                    </span>
                  </button>
                );
              }
              const a = row.asset;
              const held = items.some((i) => i.assetId === a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (held) {
                      setQuery("");
                      return;
                    }
                    addItem.mutate({ assetId: a.id, watchlistId: active?.id }, { onSuccess: () => setQuery("") });
                  }}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-slate"
                >
                  <span className={cls("num font-medium", held ? "text-accent" : "text-green")}>
                    {held ? "✓" : "+"} {a.symbol}
                  </span>
                  <span className="text-xs text-muted">{assetMarketLabel(a.assetClass, a.segment)}</span>
                </button>
              );
            })}
          </div>
        )}

        {advanced && (
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCategory(c.id)} className={cls("chip", category === c.id && "chip-active")}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {watchlistsQuery.isLoading && <div className="p-4 text-sm text-muted">Loading…</div>}
        {filtered.map((item) => (
          <Row
            key={item.assetId}
            symbol={item.symbol}
            assetClass={item.assetClass}
            segment={item.segment}
            quoteKind={item.quoteKind}
            mid={item.mid}
            marketOpen={item.marketOpen}
            marketStatusReason={item.marketStatusReason}
            active={item.symbol === activeSymbol}
            locked={!!assetsQuery.data && !availableSymbols.has(item.symbol)}
            onClick={() => selectSymbol(item.symbol)}
            onBuy={() => openQuick(item.symbol, "BUY")}
            onSell={() => openQuick(item.symbol, "SELL")}
            busy={placing && quick?.symbol === item.symbol ? `${item.symbol}:${quick.side}` : null}
            onRemove={() => removeItem.mutate({ assetId: item.assetId, watchlistId: active?.id })}
          />
        ))}
        {!watchlistsQuery.isLoading && filtered.length === 0 && (
          <div className="p-4 text-sm text-muted">
            {items.length === 0 ? "This list is empty — search above to add symbols." : "No symbols in this category."}
          </div>
        )}
      </div>

      {quick && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center"
          onClick={() => !placing && setQuick(null)}
        >
          <div className="w-full max-w-sm border border-line bg-navy2 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="num text-base font-bold">{quick.symbol}</div>
                <div className={cls("text-xs font-semibold", quick.side === "BUY" ? "text-up" : "text-down")}>
                  {quick.side === "BUY" ? "Buy / Long" : "Sell / Short"} · Market
                </div>
              </div>
              <button className="text-muted hover:text-ink" onClick={() => !placing && setQuick(null)}>
                ×
              </button>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Quantity</span>
              <input
                className="input num"
                inputMode="decimal"
                value={quickQty}
                onChange={(e) => setQuickQty(e.target.value)}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                className={cls("flex-1 py-2.5 text-sm font-bold", quick.side === "BUY" ? "btn-buy" : "btn-sell")}
                onClick={() => void submitQuick()}
                disabled={placing}
              >
                {placing ? "Placing…" : `Confirm ${quick.side}`}
              </button>
              <button className="btn-ghost" onClick={() => setQuick(null)} disabled={placing}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  symbol,
  assetClass,
  segment,
  quoteKind,
  mid,
  marketOpen,
  marketStatusReason,
  active,
  locked,
  onClick,
  onBuy,
  onSell,
  busy,
  onRemove,
}: {
  symbol: string;
  assetClass: string;
  segment?: string;
  quoteKind?: "live" | "close";
  mid?: number;
  marketOpen?: boolean;
  marketStatusReason?: string;
  active: boolean;
  locked?: boolean;
  onClick: () => void;
  onBuy: () => void;
  onSell: () => void;
  busy: string | null;
  onRemove?: () => void;
}) {
  const { tick, changePct } = useSymbolStats(symbol);
  const closed = marketOpen === false;
  const price = tick?.mid ?? mid;

  return (
    <div
      className={cls(
        "group flex cursor-pointer items-center gap-2 border-b border-line/60 px-2 py-2 transition-colors",
        active ? "bg-slate" : "hover:bg-slate/50",
        locked && "opacity-60",
      )}
      onClick={onClick}
    >
      <span className={cls("h-1.5 w-1.5 shrink-0", changePct >= 0 ? "bg-lime" : "bg-brandbright")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="num truncate text-sm font-semibold">{symbol}</span>
          <span className="shrink-0 rounded bg-slate/60 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-muted">
            {assetMarketLabel(assetClass, segment)}
          </span>
          {quoteKind === "close" && (
            <span
              className="shrink-0 rounded bg-slate/60 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-muted"
              title="Official NSE closing price"
            >
              CLOSE
            </span>
          )}
          {closed && (
            <span className="shrink-0 rounded bg-brand/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-brandbright" title={marketStatusReason}>
              CLOSED
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="num text-sm">{fmtPrice(price)}</div>
          <div className={cls("num text-[11px]", changePct >= 0 ? "text-up" : "text-down")}>
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {locked ? (
            <span className="rounded bg-slate/70 px-2 py-1.5 text-[10px] font-bold leading-none text-muted">
              NO ACCESS
            </span>
          ) : closed ? (
            <span
              className="rounded bg-slate/70 px-2 py-1.5 text-[10px] font-bold leading-none text-muted"
              title={marketStatusReason}
            >
              CLOSED
            </span>
          ) : quoteKind === "close" ? (
            <span className="rounded bg-slate/70 px-2 py-1.5 text-[10px] font-bold leading-none text-muted" title="Closing price is display-only">
              CLOSE
            </span>
          ) : (
            <>
              <button
                disabled={!!busy}
                className={cls(
                  "rounded bg-lime/15 px-2 py-1.5 text-[10px] font-bold leading-none text-lime active:scale-95",
                  busy && "opacity-50",
                )}
                title={`Buy ${symbol}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onBuy();
                }}
              >
                {busy === `${symbol}:BUY` ? "…" : "BUY"}
              </button>
              <button
                disabled={!!busy}
                className={cls(
                  "rounded bg-brand/15 px-2 py-1.5 text-[10px] font-bold leading-none text-brandbright active:scale-95",
                  busy && "opacity-50",
                )}
                title={`Sell ${symbol}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSell();
                }}
              >
                {busy === `${symbol}:SELL` ? "…" : "SELL"}
              </button>
            </>
          )}
        </div>
        {onRemove && (
          <button
            className="hidden opacity-0 transition-opacity hover:text-brandbright group-hover:opacity-100 sm:block"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
