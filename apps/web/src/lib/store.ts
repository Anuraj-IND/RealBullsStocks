"use client";

import { create } from "zustand";
import type { AccountSnapshot, Tick } from "@realbulls/shared";

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER";
  displayName: string | null;
  tenantId: string;
  status: string;
  locale?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  background: string;
}

export interface AccountInfo {
  id: string;
  type: "DEMO" | "LIVE";
  baseCurrency: string;
  balance: number;
  marginUsed: number;
  status: string;
  isPrimary: boolean;
}

interface AuthState {
  user: AuthUser | null;
  tenant: TenantInfo | null;
  accounts: AccountInfo[];
  activeAccountId: string | null;
  
  sessionChecked: boolean;
  setSession: (s: { user: AuthUser; tenant: TenantInfo | null; accounts: AccountInfo[] }) => void;
  setActiveAccount: (id: string) => void;
  markSessionChecked: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  accounts: [],
  activeAccountId: null,
  sessionChecked: false,
  setSession: ({ user, tenant, accounts }) =>
    set({ user, tenant, accounts, activeAccountId: accounts[0]?.id ?? null, sessionChecked: true }),
  setActiveAccount: (id) => set({ activeAccountId: id }),
  markSessionChecked: () => set({ sessionChecked: true }),
  clear: () => set({ user: null, tenant: null, accounts: [], activeAccountId: null, sessionChecked: true }),
}));


interface MarketState {
  ticks: Record<string, Tick>;
  prev: Record<string, number>;
  ref: Record<string, number>; 
  history: Record<string, number[]>;
  setTick: (t: Tick) => void;
}

const HISTORY_CAP = 48;

export const useMarketStore = create<MarketState>((set) => ({
  ticks: {},
  prev: {},
  ref: {},
  history: {},
  setTick: (t) =>
    set((state) => {
      const prevMid = state.ticks[t.symbol]?.mid ?? t.mid;
      const h = state.history[t.symbol];
      const nh = h ? (h.length >= HISTORY_CAP ? h.slice(1).concat(t.mid) : h.concat(t.mid)) : [t.mid];
      return {
        ticks: { ...state.ticks, [t.symbol]: t },
        prev: { ...state.prev, [t.symbol]: prevMid },
        ref: state.ref[t.symbol] !== undefined ? state.ref : { ...state.ref, [t.symbol]: t.mid },
        history: { ...state.history, [t.symbol]: nh },
      };
    }),
}));

export interface SymbolStats {
  tick: Tick | undefined;
  changePct: number;
  tickChange: number;
}


const STALE_TICK_MS = 5 * 60 * 1000;

export function useSymbolStats(symbol: string): SymbolStats {
  const rawTick = useMarketStore((s) => s.ticks[symbol]);
  const tick = rawTick && rawTick.ts && Date.now() - rawTick.ts <= STALE_TICK_MS ? rawTick : undefined;
  const ref = useMarketStore((s) => s.ref[symbol]);
  const prevMid = useMarketStore((s) => s.prev[symbol]);
  const changePct = tick && ref ? ((tick.mid - ref) / ref) * 100 : 0;
  const tickChange = tick && prevMid ? tick.mid - prevMid : 0;
  return { tick, changePct, tickChange };
}


interface AccountState {
  snapshot: AccountSnapshot | null;
  setSnapshot: (s: AccountSnapshot) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  snapshot: null,
  setSnapshot: (s) => set({ snapshot: s }),
}));


interface UiState {
  activeSymbol: string;
  setActiveSymbol: (s: string) => void;
  tab: "positions" | "orders" | "history" | "ledger";
  setTab: (t: UiState["tab"]) => void;
  
  advanced: boolean;
  toggleAdvanced: () => void;
  
  currency: "USD" | "INR";
  setCurrency: (c: "USD" | "INR") => void;
  
  mobileTab: "watchlist" | "chart" | "trade" | "positions";
  setMobileTab: (t: UiState["mobileTab"]) => void;
  
  quickSide: "BUY" | "SELL" | null;
  setQuickSide: (s: "BUY" | "SELL" | null) => void;
}

function readAdvanced(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("rb_advanced") === "1";
}

function persistAdvanced(v: boolean): void {
  if (typeof window !== "undefined") window.localStorage.setItem("rb_advanced", v ? "1" : "0");
}

function readCurrency(): "USD" | "INR" {
  if (typeof window === "undefined") return "INR";
  return window.localStorage.getItem("rb_currency") === "USD" ? "USD" : "INR";
}

export const useUiStore = create<UiState>((set) => ({
  activeSymbol: "EURUSD",
  setActiveSymbol: (s) => set({ activeSymbol: s }),
  tab: "positions",
  setTab: (t) => set({ tab: t }),
  advanced: readAdvanced(),
  toggleAdvanced: () =>
    set((state) => {
      const next = !state.advanced;
      persistAdvanced(next);
      return { advanced: next };
    }),
  currency: readCurrency(),
  setCurrency: (c) => {
    if (typeof window !== "undefined") window.localStorage.setItem("rb_currency", c);
    set({ currency: c });
  },
  mobileTab: "watchlist",
  setMobileTab: (t) => set({ mobileTab: t }),
  quickSide: null,
  setQuickSide: (s) => set({ quickSide: s }),
}));


export interface Toast {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: Math.random().toString(36).slice(2, 9) }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().push({ kind: "success", title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ kind: "error", title, message }),
  info: (title: string, message?: string) => useToastStore.getState().push({ kind: "info", title, message }),
};


interface ConnectionState {
  connected: boolean;
  setConnected: (v: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: false,
  setConnected: (v) => set({ connected: v }),
}));
