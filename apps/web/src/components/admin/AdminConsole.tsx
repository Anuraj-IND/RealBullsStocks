"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Card, Stat, Badge } from "@/components/ui/Card";
import { cls, fmtPrice } from "@/lib/format";
import { useMoney } from "@/lib/money";
import { SEGMENTS, SEGMENT_LABELS } from "@realbulls/shared";
import { useAuthStore, toast, useUiStore } from "@/lib/store";
import { downloadCsv } from "@/lib/api";
import {
  useAdminUsers,
  useAdminAdmins,
  useAdminSummary,
  useAdminTrades,
  useAdminLedger,
  useAdminLivePositions,
  useAdminUserDetail,
  useLeverageRules,
  useTenants,
  useUpdateUser,
  useSetUserLeverageSegments,
  useAdjustLedger,
  useResetPassword,
  useForceClose,
  useSetAccountStatus,
  useAdminAudit,
  useTenantSettings,
  useSetTenantSegments,
  useCreateLeverageRule,
  useCreateTenant,
  useCreateUser,
} from "@/lib/adminHooks";

type Tab = "overview" | "admins" | "users" | "trades" | "ledger" | "positions" | "risk" | "audit" | "tenants";

/**
 * Which tabs each role may open.
 *
 *  - SUPER_ADMIN  : everything, including tenant provisioning.
 *  - TENANT_ADMIN : only the tabs that operate on the users they created.
 *                   No tenant provisioning, no platform-wide settings.
 */
const TABS_BY_ROLE: Record<string, Tab[]> = {
  SUPER_ADMIN: ["overview", "admins", "users", "trades", "ledger", "positions", "risk", "audit", "tenants"],
  TENANT_ADMIN: ["overview", "users", "trades", "ledger", "positions", "audit"],
};

const TAB_LABELS: Partial<Record<Tab, string>> = {
  trades: "Trade Log",
  positions: "Live Positions",
  risk: "Risk & Leverage",
  admins: "Admins",
  users: "My Clients",
};

/** The landing path for a given role's admin panel. */
export function adminHomePath(role: string | undefined): string {
  return role === "SUPER_ADMIN" ? "/admin/super" : "/admin/tenant";
}

interface Created {
  name: string;
  username: string;
  password: string;
  role: string;
}

export default function AdminConsole() {
  const user = useAuthStore((s) => s.user);
  const currency = useUiStore((s) => s.currency);
  const setCurrency = useUiStore((s) => s.setCurrency);
  const [tab, setTab] = useState<Tab>("overview");
  const [created, setCreated] = useState<Created | null>(null);
  const [levTarget, setLevTarget] = useState<{ id: string; email: string; segments: Record<string, number> } | null>(null);
  const [fundTarget, setFundTarget] = useState<{
    id: string;
    email: string;
    accounts: Array<{ id: string; type: string; balance: number; marginUsed: number; status: string }>;
  } | null>(null);
  const [resetInfo, setResetInfo] = useState<Created | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [ownFunds, setOwnFunds] = useState<"DEPOSIT" | "WITHDRAWAL" | null>(null);
  const [brokTarget, setBrokTarget] = useState<{ id: string; name: string; brokerage: number | null; brokeragePerOrder: number | null } | null>(null);
  const [segTarget, setSegTarget] = useState<{ id: string; name: string; segments: string[] } | null>(null);
  const reset = useResetPassword();
  const sessionChecked = useAuthStore((s) => s.sessionChecked);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "TENANT_ADMIN")) {
      window.location.href = "/";
    }
  }, [sessionChecked, user]);

  if (!sessionChecked) return <div className="p-8 text-muted">Loading session…</div>;
  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "TENANT_ADMIN")) {
    return <div className="p-8 text-muted">Redirecting…</div>;
  }

  const isSuper = user.role === "SUPER_ADMIN";
  const tabs: Tab[] = TABS_BY_ROLE[user.role] ?? ["overview"];
  // Guard against a stale tab (e.g. after a role change) pointing at a
  // section the current role is not allowed to open.
  const activeTab = tabs.includes(tab) ? tab : tabs[0]!;

  async function onReset(id: string) {
    try {
      const r = await reset.mutateAsync({ id });
      setResetInfo({ name: r.name ?? "", username: r.username ?? "", password: r.password, role: r.role });
      toast.success("Password reset");
    } catch {
    }
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-2 overflow-hidden border-b border-line bg-navy2/90 px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <Link href="/terminal" className="shrink-0">
            <Logo />
          </Link>
          <span className="badge hidden bg-primary/20 text-accent sm:inline-flex">
            {isSuper ? "Super Admin Control Center" : "Tenant Admin Console"}
          </span>
          <span className={cls("badge shrink-0", isSuper ? "bg-lime/15 text-lime" : "bg-primary/20 text-accent")}>{user.role}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center border border-line">
            <button
              onClick={() => setCurrency("USD")}
              className={cls("px-2 py-1 text-xs", currency === "USD" ? "bg-accent/15 text-accent" : "text-muted hover:text-ink")}
              title="Show amounts in USD"
            >
              $<span className="hidden sm:inline"> USD</span>
            </button>
            <button
              onClick={() => setCurrency("INR")}
              className={cls("px-2 py-1 text-xs", currency === "INR" ? "bg-accent/15 text-accent" : "text-muted hover:text-ink")}
              title="Show amounts in INR"
            >
              ₹<span className="hidden sm:inline"> INR</span>
            </button>
          </div>
          <Link href="/terminal" className="btn-ghost py-1.5 text-xs">
            ← Terminal
          </Link>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-line px-4">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cls("tab whitespace-nowrap capitalize", activeTab === t && "tab-active")}>
            {TAB_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      <main className="p-3 md:p-4">
        {activeTab === "overview" && <OverviewTab isSuper={isSuper} onFund={setOwnFunds} />}
        {activeTab === "admins" && isSuper && (
          <AdminsTab isSuper={isSuper} onCreated={setCreated} onLeverage={setLevTarget} onFund={setFundTarget} onReset={onReset} onOpenClient={setClientId} onBrokerage={setBrokTarget} onSegments={setSegTarget} />
        )}
        {activeTab === "users" && <UsersTab isSuper={isSuper} onCreated={setCreated} onLeverage={setLevTarget} onFund={setFundTarget} onReset={onReset} onOpenClient={setClientId} onBrokerage={setBrokTarget} onSegments={setSegTarget} />}
        {activeTab === "trades" && <TradesTab />}
        {activeTab === "ledger" && <LedgerTab />}
        {activeTab === "positions" && <LivePositionsTab />}
        {activeTab === "risk" && isSuper && (
          <div className="space-y-4">
            <LeverageTab isSuper={isSuper} />
            <PlatformSegmentsCard />
          </div>
        )}
        {activeTab === "audit" && <AuditTab />}
        {activeTab === "tenants" && isSuper && <TenantsTab />}
      </main>

      {created && <CredentialModal data={created} onClose={() => setCreated(null)} />}
      {resetInfo && <CredentialModal data={resetInfo} title="Password reset" onClose={() => setResetInfo(null)} />}
      {levTarget && <LeverageModal target={levTarget} onClose={() => setLevTarget(null)} />}
      {fundTarget && <FundsModal target={fundTarget} onClose={() => setFundTarget(null)} />}
      {ownFunds && <OwnFundsModal type={ownFunds} onClose={() => setOwnFunds(null)} />}
      {brokTarget && <BrokerageModal target={brokTarget} onClose={() => setBrokTarget(null)} />}
      {segTarget && <SegmentsModal target={segTarget} onClose={() => setSegTarget(null)} />}
      {clientId && <ClientDrawer userId={clientId} onClose={() => setClientId(null)} />}
    </div>
  );
}

type FundTarget = {
  id: string;
  email: string;
  accounts: Array<{ id: string; type: string; balance: number; marginUsed: number; status: string }>;
};


function OverviewTab({ isSuper, onFund }: { isSuper: boolean; onFund: (type: "DEPOSIT" | "WITHDRAWAL") => void }) {
  const { data } = useAdminSummary();
  const money = useMoney();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={data?.users ?? "—"} />
        <Stat label="Admins" value={data?.admins ?? "—"} tone="amber" />
        <Stat label="Trading accounts" value={data?.accounts ?? "—"} />
        <Stat label="Open positions" value={data?.openPositions ?? "—"} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total balance" value={money.fmt(data?.totalBalance ?? 0)} />
        <Stat label="Open margin" value={money.fmt(data?.openMargin ?? 0)} tone="amber" />
        <Stat label="Realized P&L (all)" value={money.signed(data?.totalRealizedPnl ?? 0)} tone={(data?.totalRealizedPnl ?? 0) >= 0 ? "up" : "down"} />
        <Stat label="Brokerage earned" value={money.fmt(data?.totalCommission ?? 0)} tone="up" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Client deposits" value={money.fmt(data?.totalDeposits ?? 0)} />
      </div>
      {isSuper && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-buy py-1.5 text-xs" onClick={() => onFund("DEPOSIT")}>
            + Add balance
          </button>
          <button className="btn-sell py-1.5 text-xs" onClick={() => onFund("WITHDRAWAL")}>
            − Remove balance
          </button>
          <span className="text-xs text-muted">Adjusts your own trading account; the platform total updates instantly.</span>
        </div>
      )}
    </div>
  );
}

function AdminsTab({
  isSuper,
  onCreated,
  onLeverage,
  onFund,
  onReset,
  onOpenClient,
  onBrokerage,
  onSegments,
}: {
  isSuper: boolean;
  onCreated: (c: Created) => void;
  onLeverage: (t: { id: string; email: string; segments: Record<string, number> }) => void;
  onFund: (t: FundTarget) => void;
  onReset: (id: string) => void;
  onOpenClient: (id: string) => void;
  onBrokerage: (t: { id: string; name: string; brokerage: number | null; brokeragePerOrder: number | null }) => void;
  onSegments: (t: { id: string; name: string; segments: string[] }) => void;
}) {
  const [q, setQ] = useState("");
  const admins = useAdminAdmins(q);
  const money = useMoney();
  const updateUser = useUpdateUser();
  const createUser = useCreateUser();
  const [form, setForm] = useState({ name: "", password: "", role: "TENANT_ADMIN", startingBalance: "" });

  async function submit() {
    if (!form.name) return;
    try {
      const res = await createUser.mutateAsync({
        name: form.name,
        password: form.password || undefined,
        role: form.role,
        startingBalance: form.startingBalance ? money.toUsd(Number(form.startingBalance)) : undefined,
      });
      onCreated({ name: res.name ?? form.name, username: res.username ?? "", password: res.password, role: res.role });
      setForm({ name: "", password: "", role: "TENANT_ADMIN", startingBalance: "" });
    } catch {
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card title="Create admin">
        <div className="space-y-3">
          <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Jane Admin" />
          <TextField label="Password (blank = auto)" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="min 6 chars" />
          {isSuper && (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Role</span>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="TENANT_ADMIN">Tenant admin</option>
                <option value="SUPER_ADMIN">Super admin</option>
              </select>
            </label>
          )}
          <NumField label={`Starting balance (optional, ${money.currency})`} value={form.startingBalance} onChange={(v) => setForm({ ...form, startingBalance: v })} />
          <button className="btn-primary w-full" onClick={submit} disabled={createUser.isPending}>
            {createUser.isPending ? "Creating…" : "Create admin"}
          </button>
          <p className="text-[11px] text-muted">A trading account is created automatically; the password is shown for you to hand over.</p>
        </div>
      </Card>

      <Card
        title="Administrators"
        action={
          <div className="flex items-center gap-2">
            <input className="input w-56 py-1 text-xs" placeholder="Search user ID / email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-xs text-muted">{admins.data?.admins.length ?? 0}</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {["User", "Role", "Status", "Balance", "Leverage", "Last IP", "Actions"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(admins.data?.admins ?? []).map((a) => {
                const acct = a.accounts?.[0];
                const segCount = Object.keys(a.segments ?? {}).length;
                return (
                  <tr key={a.id} className="border-b border-line/60 hover:bg-slate/40">
                    <td className="px-3 py-2">
                      <button className="text-left hover:text-accent" onClick={() => onOpenClient(a.id)} title="View details">
                        <div className="num font-medium">{a.username ?? a.email}</div>
                        <div className="text-xs text-muted">{a.displayName ?? ""}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input w-36 py-1 text-xs"
                        value={a.role}
                        disabled={!isSuper}
                        onChange={(e) => updateUser.mutate({ id: a.id, body: { role: e.target.value } })}
                      >
                        <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                        {isSuper && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={a.status === "ACTIVE" ? "up" : "down"}>{a.status}</Badge>
                    </td>
                    <td className="num px-3 py-2">{money.fmt(acct?.balance ?? 0)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{segCount ? `${segCount} segment(s)` : "default"}</td>
                    <td className="num px-3 py-2 text-xs text-muted">{a.lastLoginIp ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button className="btn-ghost py-1 text-xs" onClick={() => onLeverage({ id: a.id, email: a.email, segments: a.segments ?? {} })}>
                          Leverage
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onFund({ id: a.id, email: a.email, accounts: a.accounts ?? [] })}>
                          Margin
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onBrokerage({ id: a.id, name: a.username ?? a.email, brokerage: a.brokerage ?? null, brokeragePerOrder: a.brokeragePerOrder ?? null })}>
                          Brokerage
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onSegments({ id: a.id, name: a.username ?? a.email, segments: a.allowedSegments ?? [] })}>
                          Segments
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onReset(a.id)}>
                          Reset
                        </button>
                        <button
                          className="btn-ghost py-1 text-xs"
                          onClick={() => updateUser.mutate({ id: a.id, body: { status: a.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" } })}
                        >
                          {a.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function UsersTab({
  isSuper,
  onCreated,
  onLeverage,
  onFund,
  onReset,
  onOpenClient,
  onBrokerage,
  onSegments,
}: {
  isSuper: boolean;
  onCreated: (c: Created) => void;
  onLeverage: (t: { id: string; email: string; segments: Record<string, number> }) => void;
  onFund: (t: FundTarget) => void;
  onReset: (id: string) => void;
  onOpenClient: (id: string) => void;
  onBrokerage: (t: { id: string; name: string; brokerage: number | null; brokeragePerOrder: number | null }) => void;
  onSegments: (t: { id: string; name: string; segments: string[] }) => void;
}) {
  const [q, setQ] = useState("");
  const users = useAdminUsers(q);
  const money = useMoney();
  const updateUser = useUpdateUser();
  const createUser = useCreateUser();
  const setStatus = useSetAccountStatus();
  const [form, setForm] = useState({ name: "", password: "", startingBalance: "" });

  async function submit() {
    if (!form.name) return;
    try {
      const res = await createUser.mutateAsync({
        name: form.name,
        password: form.password || undefined,
        role: "TRADER",
        startingBalance: form.startingBalance ? money.toUsd(Number(form.startingBalance)) : undefined,
      });
      onCreated({ name: res.name ?? form.name, username: res.username ?? "", password: res.password, role: res.role });
      setForm({ name: "", password: "", startingBalance: "" });
    } catch {
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card title="Create client account">
        <div className="space-y-3">
          <TextField label="Client name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Rahul Sharma" />
          <TextField label="Password (blank = auto)" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="min 6 chars" />
          <NumField label={`Starting balance (optional, ${money.currency})`} value={form.startingBalance} onChange={(v) => setForm({ ...form, startingBalance: v })} />
          <button className="btn-primary w-full" onClick={submit} disabled={createUser.isPending}>
            {createUser.isPending ? "Creating…" : "Create client & get user ID"}
          </button>
          <p className="text-[11px] text-muted">A user ID and password are generated — copy them and send them to your client.</p>
        </div>
      </Card>

      <Card
        title={isSuper ? "All traders" : "My clients"}
        action={
          <div className="flex items-center gap-2">
            <input className="input w-56 py-1 text-xs" placeholder="Search user ID / email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-xs text-muted">{users.data?.users.length ?? 0}</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {["User", "Role", "Status", "Balance", "Margin", "Net P&L", "Trades", "Last IP", "Actions", "Controls"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(users.data?.users ?? []).map((u) => {
                const acct = u.accounts[0];
                return (
                  <tr key={u.id} className="border-b border-line/60 hover:bg-slate/40">
                    <td className="px-3 py-2">
                      <button className="text-left hover:text-accent" onClick={() => onOpenClient(u.id)} title="View details">
                        <div className="num font-medium">{u.username ?? u.email}</div>
                        <div className="text-xs text-muted">{u.displayName ?? ""}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="info">{u.role}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={u.status === "ACTIVE" ? "up" : "down"}>{u.status}</Badge>
                    </td>
                    <td className="num px-3 py-2">{money.fmt(u.balance)}</td>
                    <td className="num px-3 py-2">{money.fmt(u.marginUsed)}</td>
                    <td className="num px-3 py-2">
                      <div className={cls("font-semibold", u.pnl.net >= 0 ? "text-up" : "text-down")}>{money.signed(u.pnl.net)}</div>
                      <div className="text-[11px] text-muted">
                        R {money.signed(u.pnl.realized)} · U {money.signed(u.pnl.unrealized)}
                      </div>
                    </td>
                    <td className="num px-3 py-2">
                      <div>{u.pnl.trades}</div>
                      <div className="text-[11px] text-muted">{u.pnl.openTrades} open</div>
                    </td>
                    <td className="num px-3 py-2 text-xs text-muted">{u.lastLoginIp ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="btn-ghost py-1 text-xs" onClick={() => onReset(u.id)}>
                          Reset
                        </button>
                        <button
                          className="btn-ghost py-1 text-xs"
                          onClick={() => {
                            const acc = u.accounts[0];
                            if (acc) setStatus.mutate({ id: acc.id, status: acc.status === "CLOSED" ? "ACTIVE" : "CLOSED" });
                          }}
                        >
                          {u.accounts[0]?.status === "CLOSED" ? "Unfreeze" : "Freeze"}
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => updateUser.mutate({ id: u.id, body: { status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" } })}>
                          {u.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                        {isSuper && (
                          <button className="btn-ghost py-1 text-xs" onClick={() => updateUser.mutate({ id: u.id, body: { role: "TENANT_ADMIN" } })} title="Make admin">
                            ↑ Admin
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="btn-ghost py-1 text-xs" onClick={() => onLeverage({ id: u.id, email: u.email, segments: u.segments ?? {} })}>
                          Leverage
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onFund({ id: u.id, email: u.email, accounts: u.accounts ?? [] })}>
                          Margin
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onBrokerage({ id: u.id, name: u.username ?? u.email, brokerage: u.brokerage ?? null, brokeragePerOrder: u.brokeragePerOrder ?? null })}>
                          Brokerage
                        </button>
                        <button className="btn-ghost py-1 text-xs" onClick={() => onSegments({ id: u.id, name: u.username ?? u.email, segments: u.allowedSegments ?? [] })}>
                          Segments
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TradesTab() {
  const [status, setStatus] = useState("CLOSED");
  const money = useMoney();
  const { data, isLoading } = useAdminTrades(status);
  const s = data?.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Trades" value={s?.count ?? "—"} />
        <Stat label="Realized P&L" value={money.signed(s?.realizedPnl ?? 0)} tone={(s?.realizedPnl ?? 0) >= 0 ? "up" : "down"} />
        <Stat label="Brokerage" value={money.fmt(s?.commission ?? 0)} tone="amber" />
        <Stat label="Open margin" value={money.fmt(s?.openMargin ?? 0)} />
      </div>

      <Card
        title="Trade log"
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {["CLOSED", "OPEN", "ALL"].map((v) => (
                <button key={v} onClick={() => setStatus(v)} className={cls("chip", status === v && "chip-active")}>
                  {v}
                </button>
              ))}
            </div>
            <button className="btn-ghost py-1 text-xs" onClick={() => void downloadCsv(`/admin/trades.csv?status=${status}`, `realbulls-trades-${status.toLowerCase()}.csv`)}>
              Export CSV
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {["Closed", "Client", "Symbol", "Side", "Qty", "Lev", "Entry", "Exit", "Margin", "Brokerage", "P&L", "Status"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.trades ?? []).map((t) => (
                <tr key={t.id} className="border-b border-line/60 hover:bg-slate/40">
                  <td className="num px-3 py-2 text-xs text-muted">{t.closedAt ? new Date(t.closedAt).toLocaleString() : t.openedAt ? new Date(t.openedAt).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-xs">{t.email}</td>
                  <td className="num px-3 py-2 font-semibold">{t.symbol}</td>
                  <td className={cls("px-3 py-2", t.side === "BUY" ? "text-up" : "text-down")}>{t.side}</td>
                  <td className="num px-3 py-2">{t.qty}</td>
                  <td className="num px-3 py-2">1:{t.leverage}</td>
                  <td className="num px-3 py-2">{fmtPrice(t.entry)}</td>
                  <td className="num px-3 py-2">{fmtPrice(t.exit)}</td>
                  <td className="num px-3 py-2">{money.fmt(t.marginUsed)}</td>
                  <td className="num px-3 py-2">{money.fmt(t.commission)}</td>
                  <td className={cls("num px-3 py-2 font-semibold", t.realizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(t.realizedPnl)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={t.status === "OPEN" ? "amber" : t.status === "LIQUIDATED" ? "down" : "neutral"}>{t.status}</Badge>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && (data?.trades ?? []).length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted">
                    No trades.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LedgerTab() {
  const users = useAdminUsers();
  const money = useMoney();
  const [type, setType] = useState("");
  const { data, isLoading } = useAdminLedger(type || undefined);
  const adjust = useAdjustLedger();

  const accountOptions = (users.data?.users ?? []).flatMap((u) => u.accounts.map((a) => ({ id: a.id, label: `${u.email} · ${a.type}` })));
  const [accountId, setAccountId] = useState("");
  const [adjType, setAdjType] = useState("DEPOSIT");
  const [amount, setAmount] = useState("1000");
  const [memo, setMemo] = useState("Manual credit");
  const [showAdjust, setShowAdjust] = useState(false);

  const types = ["", "DEPOSIT", "WITHDRAWAL", "ADJUSTMENT", "REALIZED_PNL", "COMMISSION", "SWAP", "MARGIN_HOLD", "MARGIN_RELEASE"];

  return (
    <div className="space-y-4">
      <Card
        title="Ledger"
        action={
          <div className="flex items-center gap-2">
            <select className="input w-40 py-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t === "COMMISSION" ? "BROKERAGE" : t || "All types"}
                </option>
              ))}
            </select>
            <button className="btn-ghost py-1 text-xs" onClick={() => setShowAdjust((v) => !v)}>
              {showAdjust ? "Close" : "Adjust balance"}
            </button>
            <button className="btn-ghost py-1 text-xs" onClick={() => void downloadCsv(`/admin/ledger.csv${type ? `?type=${type}` : ""}`, "realbulls-ledger.csv")}>
              Export CSV
            </button>
          </div>
        }
      >
        {showAdjust && (
          <div className="mb-4 grid gap-3 border border-line bg-navy2 p-3 md:grid-cols-4">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Account</span>
              <select className="input" value={accountId || accountOptions[0]?.id || ""} onChange={(e) => setAccountId(e.target.value)}>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Type</span>
              <select className="input" value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                <option value="DEPOSIT">DEPOSIT (+)</option>
                <option value="WITHDRAWAL">WITHDRAWAL (−)</option>
                <option value="ADJUSTMENT">ADJUSTMENT (±)</option>
              </select>
            </label>
            <NumField label={`Amount (${money.currency})`} value={amount} onChange={setAmount} />
            <div className="flex items-end gap-2 md:col-span-4">
              <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" />
              <button
                className="btn-primary whitespace-nowrap"
                onClick={async () => {
                  const id = accountId || accountOptions[0]?.id;
                  if (!id) return;
                  const usd = money.toUsd(parseFloat(amount));
                  if (!Number.isFinite(usd) || usd === 0) {
                    toast.error("Enter a non-zero amount");
                    return;
                  }
                  try {
                    await adjust.mutateAsync({ accountId: id, type: adjType, amount: usd, memo });
                  } catch {
                    return;
                  }
                  toast.success("Ledger updated", `${adjType} ${money.fmt(usd)}`);
                }}
              >
                Post
              </button>
            </div>
            {money.currency === "INR" && <p className="text-[11px] text-muted">Stored as USD in the ledger: {money.fmt(money.toUsd(parseFloat(amount) || 0))}</p>}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {["Time", "Client", "Type", "Dir", "Amount", "Balance", "Memo"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.entries ?? []).map((e) => (
                <tr key={e.id} className="border-b border-line/60 hover:bg-slate/40">
                  <td className="num px-3 py-2 text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">{e.email}</td>
                  <td className="px-3 py-2">{e.type}</td>
                  <td className="px-3 py-2">
                    <Badge tone={e.direction === "CREDIT" ? "up" : "down"}>{e.direction}</Badge>
                  </td>
                  <td className="num px-3 py-2">{money.fmt(e.amount)}</td>
                  <td className="num px-3 py-2">{money.fmt(e.balanceAfter)}</td>
                  <td className="px-3 py-2 text-xs text-muted">{e.memo ?? "—"}</td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && (data?.entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    No ledger entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LivePositionsTab() {
  const positions = useAdminLivePositions();
  const money = useMoney();
  const forceClose = useForceClose();
  const list = positions.data?.positions ?? [];
  const totalPnl = list.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  const totalMargin = list.reduce((acc, p) => acc + p.marginUsed, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open positions" value={list.length} />
        <Stat label="Client margin" value={money.fmt(totalMargin)} tone="amber" />
        <Stat label="Aggregate unrealized" value={money.signed(totalPnl)} tone={totalPnl >= 0 ? "up" : "down"} />
        <Stat label="Distinct traders" value={new Set(list.map((p) => p.userId)).size} />
      </div>
      <Card title="Live client positions">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {["Trader", "IP", "Symbol", "Side", "Qty", "Lev", "Entry", "Mark", "Margin", "Unrealized", "Liq.", ""].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-line/60 hover:bg-slate/40">
                  <td className="px-3 py-2 text-xs">{p.email}</td>
                  <td className="num px-3 py-2 text-xs text-muted">{p.ip ?? "—"}</td>
                  <td className="num px-3 py-2 font-semibold">{p.symbol}</td>
                  <td className={cls("px-3 py-2", p.side === "BUY" ? "text-up" : "text-down")}>{p.side}</td>
                  <td className="num px-3 py-2">{p.qty}</td>
                  <td className="num px-3 py-2">1:{p.leverage}</td>
                  <td className="num px-3 py-2">{fmtPrice(p.entry)}</td>
                  <td className="num px-3 py-2">{fmtPrice(p.mark)}</td>
                  <td className="num px-3 py-2">{money.fmt(p.marginUsed)}</td>
                  <td className={cls("num px-3 py-2 font-semibold", p.unrealizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(p.unrealizedPnl)}</td>
                  <td className="num px-3 py-2">{fmtPrice(p.liquidationPrice)}</td>
                  <td className="px-3 py-2">
                    <button className="btn-ghost py-1 text-xs" onClick={() => forceClose.mutate(p.id)}>
                      Force close
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted">
                    No live positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PlatformSegmentsCard() {
  const settings = useTenantSettings();
  const save = useSetTenantSegments();
  const [sel, setSel] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings.data && !loaded) {
      setSel(settings.data.tenant.allowedSegments ?? []);
      setLoaded(true);
    }
  }, [settings.data, loaded]);

  function toggle(s: string) {
    setSel((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  }

  return (
    <Card
      title="Platform segments"
      action={
        <button className="btn-primary py-1 text-xs" onClick={() => save.mutate(sel)} disabled={save.isPending}>
          Save
        </button>
      }
    >
      <p className="mb-3 text-xs text-muted">
        Choose which market segments this platform offers. Leave all unchecked to allow every segment. Individual users can be restricted
        further from the Users / Admins tabs.
      </p>
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <label key={s} className="flex cursor-pointer items-center gap-2 border border-line bg-navy px-3 py-1.5 text-sm">
            <input type="checkbox" checked={sel.includes(s)} onChange={() => toggle(s)} />
            <span>{SEGMENT_LABELS[s]}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}

function LeverageTab({ isSuper }: { isSuper: boolean }) {
  const rules = useLeverageRules();
  const createRule = useCreateLeverageRule();
  const [scope, setScope] = useState("ASSET_CLASS");
  const [assetClass, setAssetClass] = useState("FOREX");
  const [maxLeverage, setMaxLeverage] = useState("100");
  const [marginCallPct, setMarginCallPct] = useState("100");
  const [stopOutPct, setStopOutPct] = useState("5");

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card title="Risk & leverage controller">
        <div className="space-y-3">
          {isSuper && (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Scope</span>
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="GLOBAL">Global</option>
                <option value="ASSET_CLASS">Asset class</option>
              </select>
            </label>
          )}
          {scope !== "GLOBAL" && (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Asset class</span>
              <select className="input" value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
                {["FOREX", "CRYPTO", "COMMODITY", "STOCK", "INDEX"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-3 gap-2">
            <NumField label="Max 1:x" value={maxLeverage} onChange={setMaxLeverage} />
            <NumField label="Call %" value={marginCallPct} onChange={setMarginCallPct} />
            <NumField label="Stop-out %" value={stopOutPct} onChange={setStopOutPct} />
          </div>
          <button
            className="btn-primary w-full"
            onClick={() =>
              createRule.mutate({
                scope,
                assetClass: scope === "GLOBAL" ? null : assetClass,
                maxLeverage: parseInt(maxLeverage),
                marginCallPct: parseFloat(marginCallPct),
                stopOutPct: parseFloat(stopOutPct),
              })
            }
          >
            Apply rule
          </button>
        </div>
      </Card>

      <Card title="Active leverage rules">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr>
              {["Scope", "Target", "Max lev.", "Call %", "Stop-out %", "Tenant"].map((h) => (
                <th key={h} className="border-b border-line px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rules.data?.rules ?? []).map((r) => (
              <tr key={r.id} className="border-b border-line/60">
                <td className="px-3 py-2">{r.scope}</td>
                <td className="px-3 py-2 text-xs">{r.assetClass ?? r.assetId ?? "—"}</td>
                <td className="num px-3 py-2 text-accent">1:{r.maxLeverage}</td>
                <td className="num px-3 py-2">{r.marginCallPct}%</td>
                <td className="num px-3 py-2">{r.stopOutPct}%</td>
                <td className="px-3 py-2 text-xs text-muted">{r.tenantId ?? "global"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TenantsTab() {
  const tenants = useTenants();
  const createTenant = useCreateTenant();
  const [form, setForm] = useState({ name: "", slug: "", domain: "", primaryColor: "#0052BE", accentColor: "#019B69", background: "#060A12" });

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card title="Spawn whitelabel tenant">
        <div className="space-y-3">
          <TextField label="Brand name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <TextField label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="acmefx" />
          <TextField label="Domain" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} placeholder="trade.acmefx.com" />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Primary" value={form.primaryColor} onChange={(v) => setForm({ ...form, primaryColor: v })} />
            <ColorField label="Accent" value={form.accentColor} onChange={(v) => setForm({ ...form, accentColor: v })} />
            <ColorField label="BG" value={form.background} onChange={(v) => setForm({ ...form, background: v })} />
          </div>
          <button className="btn-primary w-full" onClick={() => createTenant.mutate(form)}>
            Create tenant
          </button>
        </div>
      </Card>

      <Card title="Tenants">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr>
              {["Brand", "Domain", "Users", "Open pos.", "Colors", "Status"].map((h) => (
                <th key={h} className="border-b border-line px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(tenants.data?.tenants ?? []).map((t) => (
              <tr key={t.id} className="border-b border-line/60">
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="num px-3 py-2 text-xs">{t.domain}</td>
                <td className="num px-3 py-2">{t.stats.users}</td>
                <td className="num px-3 py-2">{t.stats.openPositions}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-4 w-4" style={{ background: t.primaryColor }} />
                    <span className="h-4 w-4" style={{ background: t.accentColor }} />
                    <span className="h-4 w-4" style={{ background: t.background }} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={t.status === "ACTIVE" ? "up" : "down"}>{t.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function LeverageModal({ target, onClose }: { target: { id: string; email: string; segments: Record<string, number> }; onClose: () => void }) {
  const save = useSetUserLeverageSegments();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const s of SEGMENTS) init[s] = target.segments[s] ? String(target.segments[s]) : "";
    return init;
  });

  async function submit() {
    const segments: Record<string, number> = {};
    for (const s of SEGMENTS) {
      const v = parseInt(values[s] ?? "");
      if (v > 0) segments[s] = v;
    }
    await save.mutateAsync({ id: target.id, segments });
    toast.success("Leverage updated", target.email);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Leverage by segment</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          {target.email} — set the leverage provided per market segment. E.g. <span className="num text-ink">1:10</span> lets a client
          buy $1000 of stock with $100 margin; <span className="num text-ink">1:20</span> uses $50.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {SEGMENTS.map((s) => (
            <label key={s} className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{SEGMENT_LABELS[s]}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted">1:</span>
                <input className="input num" inputMode="numeric" placeholder="—" value={values[s] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [s]: e.target.value }))} />
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save leverage"}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function FundsModal({ target, onClose }: { target: FundTarget; onClose: () => void }) {
  const adjust = useAdjustLedger();
  const money = useMoney();
  const [accountId, setAccountId] = useState(target.accounts[0]?.id ?? "");
  const [type, setType] = useState("DEPOSIT");
  const [amount, setAmount] = useState("1000");
  const [memo, setMemo] = useState("Margin grant");

  async function submit() {
    const id = accountId || target.accounts[0]?.id;
    if (!id) {
      toast.error("This user has no trading account");
      return;
    }
    const usd = money.toUsd(parseFloat(amount));
    if (!Number.isFinite(usd) || usd <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    try {
      await adjust.mutateAsync({ accountId: id, type, amount: usd, memo });
    } catch {
      return;
    }
    toast.success("Funds updated", `${type} ${money.fmt(usd)} → ${target.email}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Grant margin / funds</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">{target.email}</p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Account</span>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {target.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.type} · balance {money.fmt(a.balance)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Type</span>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="DEPOSIT">Deposit (+)</option>
                <option value="WITHDRAWAL">Withdrawal (−)</option>
                <option value="ADJUSTMENT">Adjustment (±)</option>
              </select>
            </label>
            <div className="col-span-2">
              <NumField label={`Amount (${money.currency})`} value={amount} onChange={setAmount} />
              {money.currency === "INR" && (
                <p className="mt-1 text-[11px] text-muted">Posted as {money.fmt(money.toUsd(parseFloat(amount) || 0))} — the ledger stores USD.</p>
              )}
            </div>
          </div>
          <TextField label="Memo" value={memo} onChange={setMemo} />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={submit} disabled={adjust.isPending}>
            {adjust.isPending ? "Posting…" : "Post to ledger"}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnFundsModal({ type, onClose }: { type: "DEPOSIT" | "WITHDRAWAL"; onClose: () => void }) {
  const adjust = useAdjustLedger();
  const money = useMoney();
  const accounts = useAuthStore((s) => s.accounts);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const [accountId, setAccountId] = useState(activeAccountId ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("10000");
  const [memo, setMemo] = useState(type === "DEPOSIT" ? "Admin balance top-up" : "Admin balance withdrawal");

  async function submit() {
    const id = accountId || accounts[0]?.id;
    if (!id) {
      toast.error("No trading account found");
      return;
    }
    const usd = money.toUsd(parseFloat(amount));
    if (!Number.isFinite(usd) || usd <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    try {
      await adjust.mutateAsync({ accountId: id, type, amount: usd, memo });
    } catch {
      return;
    }
    toast.success(type === "DEPOSIT" ? "Balance added" : "Balance removed", money.fmt(usd));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">
            {type === "DEPOSIT" ? "Add to total balance" : "Remove from total balance"}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          Adjusts your own trading account. The overview total updates immediately.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Account</span>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.type} · balance {money.fmt(a.balance)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <NumField label={`Amount (${money.currency})`} value={amount} onChange={setAmount} />
            {money.currency === "INR" && (
              <p className="mt-1 text-[11px] text-muted">
                Posted as {money.fmt(money.toUsd(parseFloat(amount) || 0))} — the ledger stores USD.
              </p>
            )}
          </div>
          <TextField label="Memo" value={memo} onChange={setMemo} />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className={type === "DEPOSIT" ? "btn-buy flex-1" : "btn-sell flex-1"}
            onClick={submit}
            disabled={adjust.isPending || accounts.length === 0}
          >
            {adjust.isPending ? "Posting…" : type === "DEPOSIT" ? "Add balance" : "Remove balance"}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditTab() {
  const { data, isLoading } = useAdminAudit();
  return (
    <Card title="Audit log" action={<span className="text-xs text-muted">{data?.logs.length ?? 0}</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr>
              {["Time", "Action", "Actor", "Target", "IP"].map((h) => (
                <th key={h} className="border-b border-line px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.logs ?? []).map((l) => (
              <tr key={l.id} className="border-b border-line/60 hover:bg-slate/40">
                <td className="num px-3 py-2 text-xs text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2 font-medium">{l.action}</td>
                <td className="num px-3 py-2 text-xs">{l.actorId?.slice(-6) ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{l.targetType ? `${l.targetType}:${l.targetId?.slice(-6) ?? ""}` : "—"}</td>
                <td className="num px-3 py-2 text-xs text-muted">{l.ip ?? "—"}</td>
              </tr>
            ))}
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ClientDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [tradeStatus, setTradeStatus] = useState("ALL");
  const [tradeTake, setTradeTake] = useState(100);
  const [orderTake, setOrderTake] = useState(100);
  const { data, isLoading } = useAdminUserDetail(userId, { tradeStatus, tradeTake, orderTake });
  const money = useMoney();
  const winRate = data?.stats.winRate;
  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/60" onClick={onClose}>
      <div className="flex h-full w-full max-w-3xl flex-col border-l border-line bg-navy" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="font-display text-lg font-bold">{data?.user.name ?? data?.user.username ?? "Client"}</div>
            <div className="num text-xs text-muted">
              {data?.user.username} · {data?.user.email} · {data?.user.role} · {data?.user.status}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost py-1 text-xs">
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading && <div className="text-muted">Loading…</div>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Stat label="Balance" value={money.fmt(data.stats.balance)} />
                <Stat label="Margin used" value={money.fmt(data.stats.marginUsed)} tone="amber" />
                <Stat label="Deposits" value={money.fmt(data.stats.deposits)} />
                <Stat label="Realized P&L" value={money.signed(data.stats.realizedPnl)} tone={data.stats.realizedPnl >= 0 ? "up" : "down"} />
                <Stat label="Unrealized P&L" value={money.signed(data.stats.unrealizedPnl)} tone={data.stats.unrealizedPnl >= 0 ? "up" : "down"} />
                <Stat label="Brokerage" value={money.fmt(data.stats.commission)} tone="amber" />
                <Stat label="Net P&L" value={money.signed(data.stats.netPnl)} tone={data.stats.netPnl >= 0 ? "up" : "down"} />
                <Stat label="Trades" value={`${data.stats.trades} (${data.stats.openTrades} open)`} />
                <Stat
                  label="Win rate"
                  value={winRate === null || winRate === undefined ? "—" : `${Math.round(winRate * 100)}% · ${data.stats.wins}W/${data.stats.losses}L`}
                />
              </div>

              <Card title="Leverage by segment">
                {Object.keys(data.segments).length === 0 ? (
                  <div className="text-sm text-muted">Default leverage.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.segments).map(([seg, lev]) => (
                      <span key={seg} className="badge bg-primary/15 text-accent">
                        {SEGMENT_LABELS[seg as keyof typeof SEGMENT_LABELS] ?? seg} · 1:{lev}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              <Card title={`Open positions (${data.openPositions.length})`}>
                <MiniTable head={["Symbol", "Side", "Qty", "Entry", "Mark", "Margin", "Unrealized"]}>
                  {data.openPositions.map((p) => (
                    <tr key={p.id} className="border-b border-line/60">
                      <td className="num px-3 py-2 font-semibold">{p.symbol}</td>
                      <td className={cls("px-3 py-2", p.side === "BUY" ? "text-up" : "text-down")}>{p.side}</td>
                      <td className="num px-3 py-2">{p.qty}</td>
                      <td className="num px-3 py-2">{fmtPrice(p.entry)}</td>
                      <td className="num px-3 py-2">{fmtPrice(p.mark)}</td>
                      <td className="num px-3 py-2">{money.fmt(p.marginUsed)}</td>
                      <td className={cls("num px-3 py-2 font-semibold", p.unrealizedPnl >= 0 ? "text-up" : "text-down")}>{money.signed(p.unrealizedPnl)}</td>
                    </tr>
                  ))}
                  {data.openPositions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-sm text-muted">
                        No open positions
                      </td>
                    </tr>
                  )}
                </MiniTable>
              </Card>

              <Card
                title={`Trade history (${data.trades.length} of ${data.tradesTotal})`}
                action={
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[
                        ["ALL", "All"],
                        ["CLOSED", "Closed"],
                        ["LIQUIDATED", "Liquidated"],
                        ["OPEN", "Open"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => {
                            setTradeStatus(value);
                            setTradeTake(100);
                          }}
                          className={cls("chip", tradeStatus === value && "chip-active")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn-ghost py-1 text-xs"
                      onClick={() =>
                        void downloadCsv(
                          `/admin/trades.csv?userId=${userId}&status=${tradeStatus}`,
                          `realbulls-trades-${data.user.username ?? userId}-${tradeStatus.toLowerCase()}.csv`,
                        )
                      }
                    >
                      Export CSV
                    </button>
                  </div>
                }
              >
                <MiniTable head={["Opened", "Symbol", "Side", "Qty", "Lev", "Entry", "Exit / Mark", "Margin", "P&L", "Status"]}>
                  {data.trades.map((t) => {
                    const pnl = t.status === "OPEN" ? t.unrealizedPnl : t.realizedPnl;
                    return (
                      <tr key={t.id} className="border-b border-line/60">
                        <td className="num px-3 py-2 text-xs text-muted">{new Date(t.openedAt).toLocaleString()}</td>
                        <td className="num px-3 py-2 font-semibold">{t.symbol}</td>
                        <td className={cls("px-3 py-2", t.side === "BUY" ? "text-up" : "text-down")}>{t.side}</td>
                        <td className="num px-3 py-2">{t.qty}</td>
                        <td className="num px-3 py-2">1:{t.leverage}</td>
                        <td className="num px-3 py-2">{fmtPrice(t.entry)}</td>
                        <td className="num px-3 py-2">{fmtPrice(t.exit ?? t.mark)}</td>
                        <td className="num px-3 py-2">{money.fmt(t.marginUsed)}</td>
                        <td className={cls("num px-3 py-2 font-semibold", pnl >= 0 ? "text-up" : "text-down")}>{money.signed(pnl)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={t.status === "OPEN" ? "amber" : t.status === "LIQUIDATED" ? "down" : "neutral"}>{t.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {data.trades.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-sm text-muted">
                        No trades
                      </td>
                    </tr>
                  )}
                </MiniTable>
                {data.trades.length < data.tradesTotal && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    {tradeTake < 5000 && (
                      <button className="btn-ghost py-1 text-xs" onClick={() => setTradeTake((n) => Math.min(n + 100, 5000))}>
                        Load more
                      </button>
                    )}
                    {data.tradesTotal <= 5000 && (
                      <button className="btn-ghost py-1 text-xs" onClick={() => setTradeTake(data.tradesTotal)}>
                        Load all
                      </button>
                    )}
                    {data.tradesTotal > 5000 && (
                      <span className="text-[11px] text-muted">Showing first 5000 — use Export CSV for the full history.</span>
                    )}
                  </div>
                )}
              </Card>

              <Card
                title={`Order history (${data.orders.length} of ${data.ordersTotal})`}
                action={
                  <span className="text-[11px] text-muted">Entries & limit orders; closes are in trade history</span>
                }
              >
                <MiniTable head={["Time", "Symbol", "Side", "Type", "Qty", "Price", "Filled", "Lev", "Status", "Position"]}>
                  {data.orders.map((o) => (
                    <tr key={o.id} className="border-b border-line/60">
                      <td className="num px-3 py-2 text-xs text-muted">{new Date(o.createdAt).toLocaleString()}</td>
                      <td className="num px-3 py-2 font-semibold">{o.symbol}</td>
                      <td className={cls("px-3 py-2", o.side === "BUY" ? "text-up" : "text-down")}>{o.side}</td>
                      <td className="px-3 py-2 text-xs">{o.type}</td>
                      <td className="num px-3 py-2">{o.qty}</td>
                      <td className="num px-3 py-2">{fmtPrice(o.price ?? o.filledPrice)}</td>
                      <td className="num px-3 py-2 text-xs">
                        {o.filledQty > 0 ? `${o.filledQty} @ ${fmtPrice(o.filledPrice)}` : "—"}
                      </td>
                      <td className="num px-3 py-2">1:{o.leverage}</td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            o.status === "FILLED"
                              ? "up"
                              : o.status === "REJECTED"
                                ? "down"
                                : o.status === "PENDING" || o.status === "PARTIAL"
                                  ? "amber"
                                  : "neutral"
                          }
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td className="num px-3 py-2 text-xs text-muted">{o.positionId ? o.positionId.slice(0, 8) : "—"}</td>
                    </tr>
                  ))}
                  {data.orders.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-sm text-muted">
                        No orders
                      </td>
                    </tr>
                  )}
                </MiniTable>
                {data.orders.length < data.ordersTotal && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    {orderTake < 5000 && (
                      <button className="btn-ghost py-1 text-xs" onClick={() => setOrderTake((n) => Math.min(n + 100, 5000))}>
                        Load more
                      </button>
                    )}
                    {data.ordersTotal <= 5000 && (
                      <button className="btn-ghost py-1 text-xs" onClick={() => setOrderTake(data.ordersTotal)}>
                        Load all
                      </button>
                    )}
                    {data.ordersTotal > 5000 && (
                      <span className="text-[11px] text-muted">Showing first 5000 orders.</span>
                    )}
                  </div>
                )}
              </Card>

              <Card title="Recent ledger">
                <MiniTable head={["Time", "Type", "Dir", "Amount", "Balance", "Memo"]}>
                  {data.ledger.map((e) => (
                    <tr key={e.id} className="border-b border-line/60">
                      <td className="num px-3 py-2 text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.type === "COMMISSION" ? "BROKERAGE" : e.type}</td>
                      <td className="px-3 py-2">
                        <Badge tone={e.direction === "CREDIT" ? "up" : "down"}>{e.direction}</Badge>
                      </td>
                      <td className="num px-3 py-2">{money.fmt(e.amount)}</td>
                      <td className="num px-3 py-2">{money.fmt(e.balanceAfter)}</td>
                      <td className="px-3 py-2 text-xs text-muted">{e.memo ?? "—"}</td>
                    </tr>
                  ))}
                  {data.ledger.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-muted">
                        No entries
                      </td>
                    </tr>
                  )}
                </MiniTable>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted">
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
    </div>
  );
}

function SegmentsModal({ target, onClose }: { target: { id: string; name: string; segments: string[] }; onClose: () => void }) {
  const update = useUpdateUser();
  const [selected, setSelected] = useState<string[]>(target.segments);

  function toggle(seg: string) {
    setSelected((s) => (s.includes(seg) ? s.filter((x) => x !== seg) : [...s, seg]));
  }

  async function save() {
    await update.mutateAsync({ id: target.id, body: { allowedSegments: selected } });
    toast.success("Trading permissions updated", target.name);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Trading permissions</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          {target.name} — choose which market segments this user may trade. Leave all unchecked to allow every segment.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SEGMENTS.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 border border-line bg-navy px-3 py-2 text-sm">
              <input type="checkbox" checked={selected.includes(s)} onChange={() => toggle(s)} />
              <span>{SEGMENT_LABELS[s]}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button className="btn-ghost" onClick={() => setSelected([])} disabled={update.isPending}>
            Allow all
          </button>
        </div>
      </div>
    </div>
  );
}

function BrokerageModal({
  target,
  onClose,
}: {
  target: { id: string; name: string; brokerage: number | null; brokeragePerOrder: number | null };
  onClose: () => void;
}) {
  const update = useUpdateUser();
  const [perLot, setPerLot] = useState(target.brokerage != null ? String(target.brokerage) : "");
  const [perOrder, setPerOrder] = useState(target.brokeragePerOrder != null ? String(target.brokeragePerOrder) : "");

  async function save(clear = false) {
    const parse = (v: string) => (clear || v.trim() === "" ? null : parseFloat(v));
    const lot = parse(perLot);
    const ord = parse(perOrder);
    if (lot !== null && (Number.isNaN(lot) || lot < 0)) {
      toast.error("Enter a valid per-lot amount");
      return;
    }
    if (ord !== null && (Number.isNaN(ord) || ord < 0)) {
      toast.error("Enter a valid per-order amount");
      return;
    }
    await update.mutateAsync({ id: target.id, body: { commissionPerLot: lot, commissionPerOrder: ord } });
    toast.success(clear ? "Brokerage reset to default" : "Brokerage updated", target.name);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Brokerage</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          {target.name} — set the brokerage charged on this user&apos;s trades. Leave empty to use the platform default.
        </p>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Per lot — derivatives (F&amp;O)</span>
          <input className="input num" inputMode="decimal" placeholder="e.g. 20" value={perLot} onChange={(e) => setPerLot(e.target.value)} />
          <span className="mt-1 block text-[11px] text-muted">Charged per lot. e.g. 20 × 2 lots = 40.</span>
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Per order — equity / cash</span>
          <input className="input num" inputMode="decimal" placeholder="e.g. 20" value={perOrder} onChange={(e) => setPerOrder(e.target.value)} />
          <span className="mt-1 block text-[11px] text-muted">Flat charge per order, regardless of quantity.</span>
        </label>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={() => save(false)} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button className="btn-ghost" onClick={() => save(true)} disabled={update.isPending}>
            Use default
          </button>
        </div>
      </div>
    </div>
  );
}

function CredentialModal({ data, onClose, title = "Account created" }: { data: Created; onClose: () => void; title?: string }) {
  const text = `Name: ${data.name}\nUser ID: ${data.username}\nPassword: ${data.password}\nRole: ${data.role}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Credentials copied");
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-line bg-navy2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            ×
          </button>
        </div>
        <p className="mb-3 text-sm text-muted">Share these credentials with your client. The password is shown once.</p>
        <div className="space-y-2 border border-line bg-navy p-3 text-sm">
          <Row label="Name" value={data.name} />
          <Row label="User ID" value={data.username} mono />
          <Row label="Password" value={data.password} mono />
          <Row label="Role" value={data.role} />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={copy}>
            Copy credentials
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={cls(mono ? "num" : "", "font-medium text-ink")}>{value}</span>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <input className="input num" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <input type="color" className="h-9 w-full border border-line bg-navy2" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
