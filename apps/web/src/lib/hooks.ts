"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "./api";
import { useAuthStore, toast } from "./store";
import type { OrderDTO, PositionDTO } from "@realbulls/shared";

export interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  baseCurrency: string;
  quoteCurrency: string;
  contractSize: number;
  tickSize: number;
  minQty: number;
  maxLeverage: number;
  feedSource: string;
  enabled: boolean;
  spreadMarkupBps: number;
  commissionPerLot: number;
  
  commissionPerOrder: number;
  
  leverage: number;
  
  segment?: string;
  marketOpen?: boolean;
  marketStatusReason?: string;
  marketStatusSource?: string;
  marginCallPct?: number;
  stopOutPct?: number;
  bid?: number;
  ask?: number;
  mid?: number;
  ts?: number;
  quoteSource?: "redis" | "close";
  quoteKind?: "live" | "close";
  quoteAsOf?: number;
}

export interface WatchlistItem {
  assetId: string;
  symbol: string;
  name: string;
  assetClass: string;
  segment?: string;
  feedSource?: string;
  marketOpen?: boolean;
  marketStatusReason?: string;
  marketStatusSource?: string;
  bid?: number;
  ask?: number;
  mid?: number;
  ts?: number;
  quoteSource?: "redis" | "close";
  quoteKind?: "live" | "close";
  quoteAsOf?: number;
}

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: () => apiGet<{ assets: AssetRow[] }>("/assets"),
    staleTime: 30000,
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlists"],
    queryFn: () => apiGet<{ watchlists: Array<{ id: string; name: string; items: WatchlistItem[] }> }>("/watchlists"),
    staleTime: 15000,
  });
}

export function useAddWatchlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, instrumentToken, watchlistId }: { assetId?: string; instrumentToken?: string; watchlistId?: string }) =>
      apiPost("/watchlists/items", { assetId, instrumentToken, watchlistId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e: unknown) => toast.error("Could not add symbol", e instanceof Error ? e.message : undefined),
  });
}

export interface InstrumentResult {
  instrumentToken: string;
  tradingsymbol: string;
  name: string;
  underlying: string;
  expiry: string | null;
  strike: number;
  tickSize: number;
  lotSize: number;
  instrumentType: string;
  optionType: string | null;
  segment: string;
  exchange: string;
  lastPrice: number;
  assetClass: string;
}

export function useInstrumentSearch(
  q: string,
  opts?: { type?: string; enabled?: boolean },
) {
  const query = q.trim();
  return useQuery({
    queryKey: ["instrument-search", query, opts?.type ?? ""],
    queryFn: () =>
      apiGet<{ instruments: InstrumentResult[] }>(
        `/instruments/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(opts?.type ?? "")}&limit=50`,
      ),
    enabled: (opts?.enabled ?? true) && query.length >= 1,
    staleTime: 30000,
  });
}

export function useRemoveWatchlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, watchlistId }: { assetId: string; watchlistId?: string }) =>
      apiDelete(`/watchlists/items/${assetId}${watchlistId ? `?watchlistId=${encodeURIComponent(watchlistId)}` : ""}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
  });
}

export function useCreateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<{ id: string; name: string }>("/watchlists", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
    onError: (e: unknown) => toast.error("Could not create watchlist", e instanceof Error ? e.message : undefined),
  });
}

export function useRenameWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiPatch(`/watchlists/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
  });
}

export function useDeleteWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/watchlists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
    onError: (e: unknown) => toast.error("Could not delete watchlist", e instanceof Error ? e.message : undefined),
  });
}

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: () => apiGet<{ positions: PositionDTO[]; summary: { unrealizedPnl: number; realizedToday: number; dayPnl: number; marginUsed: number; balance: number; equity: number } }>("/positions"),
    refetchInterval: 3000,
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => apiGet<{ orders: OrderDTO[] }>("/orders"),
    refetchInterval: 5000,
  });
}

export function useOrderHistory() {
  return useQuery({
    queryKey: ["orders", "history"],
    queryFn: () => apiGet<{ orders: OrderDTO[] }>("/orders/history"),
    refetchInterval: 15000,
  });
}

export function usePositionHistory() {
  return useQuery({
    queryKey: ["positions", "history"],
    queryFn: () => apiGet<{ positions: PositionDTO[] }>("/positions/history"),
    refetchInterval: 15000,
  });
}

export function useLedger() {
  return useQuery({
    queryKey: ["ledger"],
    queryFn: () => apiGet<{ entries: Array<{ id: string; direction: string; type: string; amount: number; balanceAfter: number; memo: string | null; createdAt: string }> }>("/ledger"),
    refetchInterval: 10000,
  });
}

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, qty }: { id: string; qty?: number }) => apiPost(`/positions/${id}/close`, qty ? { qty } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("Position closed");
    },
    onError: (e: unknown) => toast.error("Close failed", e instanceof Error ? e.message : undefined),
  });
}

export function useCloseAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ closed: number }>("/positions/close-all"),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("All positions closed", `${data?.closed ?? 0} position(s)`);
    },
    onError: (e: unknown) => toast.error("Close all failed", e instanceof Error ? e.message : undefined),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.info("Order cancelled");
    },
    onError: (e: unknown) => toast.error("Cancel failed", e instanceof Error ? e.message : undefined),
  });
}

export function useActiveAccount() {
  const { accounts, activeAccountId } = useAuthStore();
  return accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;
}

export interface AnalyticsResponse {
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  maxDrawdown: number;
  equityCurve: Array<{ time: string; equity: number }>;
  dailyPnl: Array<{ date: string; pnl: number; trades: number }>;
  tradeLog: Array<{ id: string; side: string; qty: number; entry: number; exit: number | null; realizedPnl: number; openedAt: string; closedAt: string | null }>;
}

export function useAnalytics() {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<AnalyticsResponse>("/analytics"),
    refetchInterval: 20000,
  });
}


export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<{ unread: number; notifications: AppNotification[] }>("/notifications"),
    refetchInterval: 20000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => apiPost("/notifications/read", ids ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete("/notifications"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}


export interface PriceAlert {
  id: string;
  assetId: string;
  symbol: string;
  direction: "ABOVE" | "BELOW";
  price: number;
  status: string;
  note: string | null;
  mark: number | null;
  createdAt: string;
  triggeredAt: string | null;
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<{ alerts: PriceAlert[] }>("/alerts"),
    refetchInterval: 15000,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { assetId: string; direction: "ABOVE" | "BELOW"; price: number; note?: string }) => apiPost("/alerts", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Price alert created");
    },
    onError: (e: unknown) => toast.error("Could not create alert", e instanceof Error ? e.message : undefined),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}


export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: { displayName?: string; locale?: "en" | "hi" }) =>
      apiPatch<{ user: Record<string, unknown> }>("/me", body),
    onSuccess: () => toast.success("Saved"),
    onError: (e: unknown) => toast.error("Could not save", e instanceof Error ? e.message : undefined),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => apiPost("/me/password", body),
    onSuccess: () => toast.success("Password updated"),
    onError: (e: unknown) => toast.error("Could not change password", e instanceof Error ? e.message : undefined),
  });
}

export interface ZerodhaStatus {
  configured: boolean;
  connected: boolean;
  userId: string | null;
  connectedAt: string | null;
}

export function useZerodhaStatus() {
  return useQuery({
    queryKey: ["broker", "zerodha"],
    queryFn: () => apiGet<ZerodhaStatus>("/broker/zerodha/status"),
    refetchInterval: 20000,
  });
}


export function useModifyPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stopLoss, takeProfit }: { id: string; stopLoss: number | null; takeProfit: number | null }) =>
      apiPatch(`/positions/${id}`, { stopLoss, takeProfit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
      toast.success("SL/TP updated");
    },
    onError: (e: unknown) => toast.error("Update failed", e instanceof Error ? e.message : undefined),
  });
}

export function useModifyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiPatch(`/orders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order updated");
    },
    onError: (e: unknown) => toast.error("Update failed", e instanceof Error ? e.message : undefined),
  });
}
