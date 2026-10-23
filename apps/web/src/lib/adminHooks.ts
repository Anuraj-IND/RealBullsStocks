"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiPatch } from "./api";
import { toast } from "./store";

const fail = (title: string) => (e: unknown) => toast.error(title, e instanceof Error ? e.message : undefined);

export interface AdminUser {
  id: string;
  tenantId: string;
  email: string;
  username: string | null;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER";
  status: string;
  displayName: string | null;
  lastLoginIp: string | null;
  lastLoginAt: string | null;
  segments: Record<string, number>;
  brokerage: number | null;
  brokeragePerOrder: number | null;
  allowedSegments: string[];
  balance: number;
  marginUsed: number;
  pnl: { realized: number; unrealized: number; commission: number; net: number; trades: number; openTrades: number };
  accounts: Array<{ id: string; type: string; balance: number; marginUsed: number; status: string }>;
}

export interface AdminLivePosition {
  id: string;
  userId: string;
  email: string;
  ip: string | null;
  symbol: string;
  side: string;
  qty: number;
  leverage: number;
  entry: number;
  mark: number | null;
  marginUsed: number;
  unrealizedPnl: number;
  liquidationPrice: number | null;
}

export interface LeverageRuleRow {
  id: string;
  tenantId: string | null;
  scope: string;
  assetClass: string | null;
  assetId: string | null;
  maxLeverage: number;
  marginCallPct: number;
  stopOutPct: number;
  enabled: boolean;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  domain: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  background: string;
  status: string;
  stats: { users: number; accounts: number; openPositions: number };
}

export function useAdminUsers(q = "") {
  return useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => apiGet<{ users: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    refetchInterval: 15000,
  });
}

export function useAdminLivePositions() {
  return useQuery({
    queryKey: ["admin", "positions"],
    queryFn: () => apiGet<{ positions: AdminLivePosition[] }>("/admin/positions"),
    refetchInterval: 3000,
  });
}

export function useLeverageRules() {
  return useQuery({ queryKey: ["admin", "leverage"], queryFn: () => apiGet<{ rules: LeverageRuleRow[] }>("/admin/leverage") });
}

export function useTenants() {
  return useQuery({ queryKey: ["admin", "tenants"], queryFn: () => apiGet<{ tenants: TenantRow[] }>("/admin/tenants") });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiPatch(`/admin/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: fail("Update failed"),
  });
}

export function useSetUserLeverage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiPut(`/admin/users/${id}/leverage`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: fail("Leverage update failed"),
  });
}

export function useSetUserLeverageSegments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, segments }: { id: string; segments: Record<string, number> }) =>
      apiPut<{ segments: Record<string, number> }>(`/admin/users/${id}/leverage/segments`, { segments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: fail("Segments update failed"),
  });
}

export function useAdjustLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/admin/ledger/adjust", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
      qc.invalidateQueries({ queryKey: ["admin", "summary"] });
      qc.invalidateQueries({ queryKey: ["admin", "ledger"] });
    },
    onError: fail("Funds update failed"),
  });
}

export function useCreateLeverageRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPut("/admin/leverage", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "leverage"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: fail("Leverage rule failed"),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/admin/tenants", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
    onError: fail("Tenant create failed"),
  });
}

export interface AdminSummary {
  users: number;
  admins: number;
  accounts: number;
  openPositions: number;
  totalRealizedPnl: number;
  totalCommission: number;
  totalDeposits: number;
  openMargin: number;
  totalBalance: number;
}

export interface AdminRow {
  id: string;
  tenantId: string;
  email: string;
  username: string | null;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER";
  status: string;
  displayName: string | null;
  lastLoginIp: string | null;
  lastLoginAt: string | null;
  segments: Record<string, number>;
  brokerage: number | null;
  brokeragePerOrder: number | null;
  allowedSegments: string[];
  accounts: Array<{ id: string; type: string; balance: number; marginUsed: number; status: string }>;
}

export interface AdminTrade {
  id: string;
  email: string;
  symbol: string;
  assetClass: string;
  side: string;
  qty: number;
  leverage: number;
  entry: number;
  exit: number | null;
  marginUsed: number;
  commission: number;
  realizedPnl: number;
  unrealizedPnl: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

export interface AdminLedgerEntry {
  id: string;
  email: string;
  accountId: string;
  direction: "CREDIT" | "DEBIT";
  type: string;
  amount: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  memo: string | null;
  createdAt: string;
}

export function useAdminSummary() {
  return useQuery({ queryKey: ["admin", "summary"], queryFn: () => apiGet<AdminSummary>("/admin/summary"), refetchInterval: 15000 });
}

export function useAdminAdmins(q = "") {
  return useQuery({
    queryKey: ["admin", "admins", q],
    queryFn: () => apiGet<{ admins: AdminRow[] }>(`/admin/admins${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    refetchInterval: 15000,
  });
}

export function useAdminTrades(status: string) {
  return useQuery({
    queryKey: ["admin", "trades", status],
    queryFn: () => apiGet<{ summary: { count: number; realizedPnl: number; commission: number; openMargin: number }; trades: AdminTrade[] }>(`/admin/trades?status=${status}`),
    refetchInterval: 8000,
  });
}

export function useAdminLedger(type?: string) {
  return useQuery({
    queryKey: ["admin", "ledger", type ?? "all"],
    queryFn: () => apiGet<{ entries: AdminLedgerEntry[] }>(`/admin/ledger${type ? `?type=${type}` : ""}`),
    refetchInterval: 10000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<{ id: string; name: string | null; username: string | null; email: string; role: string; password: string }>("/admin/users", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "admins"] });
      qc.invalidateQueries({ queryKey: ["admin", "summary"] });
    },
    onError: fail("Create failed"),
  });
}

export interface ClientDetail {
  user: {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    role: string;
    status: string;
    lastLoginIp: string | null;
    lastLoginAt: string | null;
  };
  accounts: Array<{ id: string; type: string; balance: number; marginUsed: number; status: string }>;
  segments: Record<string, number>;
  stats: {
    balance: number;
    marginUsed: number;
    deposits: number;
    realizedPnl: number;
    unrealizedPnl: number;
    commission: number;
    netPnl: number;
    trades: number;
    openTrades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    grantedToClients: number | null;
    clientStats: {
      realizedPnl: number;
      unrealizedPnl: number;
      netPnl: number;
      commission: number;
      trades: number;
      openTrades: number;
      wins: number;
      losses: number;
      winRate: number | null;
    } | null;
  };
  openPositions: Array<{
    id: string;
    email: string;
    symbol: string;
    side: string;
    qty: number;
    entry: number;
    mark: number | null;
    marginUsed: number;
    unrealizedPnl: number;
    liquidationPrice: number | null;
  }>;
  tradesTotal: number;
  trades: Array<{
    id: string;
    email: string;
    symbol: string;
    assetClass: string;
    side: string;
    qty: number;
    leverage: number;
    entry: number;
    exit: number | null;
    mark: number | null;
    marginUsed: number;
    commission: number;
    realizedPnl: number;
    unrealizedPnl: number;
    status: string;
    openedAt: string;
    closedAt: string | null;
  }>;
  ordersTotal: number;
  orders: Array<{
    id: string;
    email: string;
    symbol: string;
    assetClass: string;
    side: string;
    type: string;
    qty: number;
    price: number | null;
    filledPrice: number | null;
    filledQty: number;
    leverage: number;
    status: string;
    positionId: string | null;
    createdAt: string;
    filledAt: string | null;
  }>;
  ledger: Array<{ id: string; type: string; direction: string; amount: number; balanceAfter: number; memo: string | null; createdAt: string }>;
}

export function useAdminUserDetail(
  id: string | null,
  params?: { tradeStatus?: string; tradeTake?: number; orderTake?: number },
) {
  const tradeStatus = params?.tradeStatus ?? "ALL";
  const tradeTake = params?.tradeTake ?? 100;
  const orderTake = params?.orderTake ?? 100;
  return useQuery({
    queryKey: ["admin", "user", id, tradeStatus, tradeTake, orderTake],
    enabled: Boolean(id),
    queryFn: () =>
      apiGet<ClientDetail>(
        `/admin/users/${id}/detail?tradeStatus=${encodeURIComponent(tradeStatus)}&tradeTake=${tradeTake}&orderTake=${orderTake}`,
      ),
    refetchInterval: 5000,
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      apiPost<{ id: string; name: string | null; username: string | null; email: string; role: string; password: string }>(
        `/admin/users/${id}/reset-password`,
        password ? { password } : {},
      ),
    onError: fail("Password reset failed"),
  });
}

export function useForceClose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/admin/positions/${id}/force-close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "positions"] });
      toast.success("Position force-closed");
    },
    onError: (e: unknown) => toast.error("Force-close failed", e instanceof Error ? e.message : undefined),
  });
}

export function useSetAccountStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/admin/accounts/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Account updated");
    },
    onError: fail("Account update failed"),
  });
}

export interface AuditLog {
  id: string;
  tenantId: string | null;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
}

export function useAdminAudit() {
  return useQuery({ queryKey: ["admin", "audit"], queryFn: () => apiGet<{ logs: AuditLog[] }>("/admin/audit"), refetchInterval: 15000 });
}

export function useTenantSettings() {
  return useQuery({
    queryKey: ["admin", "tenant-settings"],
    queryFn: () => apiGet<{ tenant: { id: string; name: string; allowedSegments: string[] } }>("/admin/tenant-settings"),
  });
}

export function useSetTenantSegments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (segments: string[]) => apiPatch("/admin/tenant/segments", { segments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenant-settings"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Platform segments updated");
    },
    onError: fail("Segments update failed"),
  });
}
