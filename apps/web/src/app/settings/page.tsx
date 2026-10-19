"use client";

import { useEffect, useState } from "react";
import { TopBar, useEnsureSession } from "@/components/terminal/TopBar";
import { Card } from "@/components/ui/Card";
import { cls, fmtPrice, fmtSigned } from "@/lib/format";
import { useAuthStore } from "@/lib/store";
import { useI18n, LOCALES, type Locale } from "@/lib/i18n";
import { useAlerts, useCreateAlert, useDeleteAlert, useUpdateProfile, useChangePassword, useNotifications, useAssets, useZerodhaStatus } from "@/lib/hooks";
import { API_BASE } from "@/lib/api";

export default function SettingsPage() {
  useEnsureSession();
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <SettingsInner />
      </main>
    </div>
  );
}

function SettingsInner() {
  const { t, locale, setLocale } = useI18n();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const tenant = useAuthStore((s) => s.tenant);
  const accounts = useAuthStore((s) => s.accounts);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  useEffect(() => setDisplayName(user?.displayName ?? ""), [user?.displayName]);

  const updateProfile = useUpdateProfile();

  function saveProfile() {
    updateProfile.mutate({ displayName: displayName || undefined, locale });
    if (user) setSession({ user: { ...user, displayName }, tenant, accounts });
  }

  return (
    <>
      <h1 className="font-display text-lg font-bold">{t("settings.title")}</h1>

      <Card title={t("settings.profile")}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">User ID</span>
            <input className="input num" value={user?.username ?? "—"} disabled />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{t("settings.displayName")}</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{t("settings.language")}</span>
            <select className="input" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn-primary" onClick={saveProfile} disabled={updateProfile.isPending}>
              {t("common.save")}
            </button>
          </div>
        </div>
      </Card>

      <SecurityCard />
      <BrokerCard />
      <AlertsCard />

      <Card title={t("common.notifications")}>
        <NotificationsList />
      </Card>
    </>
  );
}

function BrokerCard() {
  const status = useZerodhaStatus();
  const connected = status.data?.connected ?? false;
  const configured = status.data?.configured ?? false;
  return (
    <Card title="Market data broker">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="flex items-center gap-2">
            <span className={cls("h-2 w-2", connected ? "bg-lime" : "bg-brandbright")} />
            <span className="font-medium">Zerodha Kite Connect</span>
            <span className={cls("badge", connected ? "bg-lime/15 text-lime" : "bg-slate2 text-muted")}>
              {connected ? "Connected" : configured ? "Not connected" : "Not configured"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {connected
              ? `Live NSE/BSE market data (user ${status.data?.userId ?? "—"}).`
              : "Connect your Zerodha account to stream real Indian prices. Zerodha requires a login once per day."}
          </p>
        </div>
        <a
          href={`${API_BASE}/broker/zerodha/login`}
          className={cls("btn-primary py-1.5 text-xs", !configured && "pointer-events-none opacity-50")}
        >
          {connected ? "Reconnect" : "Connect Zerodha"}
        </a>
      </div>
    </Card>
  );
}

function SecurityCard() {
  const { t } = useI18n();
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <Card title={t("settings.security")}>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{t("settings.currentPassword")}</span>
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">{t("settings.newPassword")}</span>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button
            className="btn-primary"
            disabled={change.isPending || current.length < 1 || next.length < 6}
            onClick={() => {
              change.mutate(
                { currentPassword: current, newPassword: next },
                {
                  onSuccess: () => {
                    setCurrent("");
                    setNext("");
                  },
                },
              );
            }}
          >
            {t("settings.changePassword")}
          </button>
        </div>
      </div>
    </Card>
  );
}

function AlertsCard() {
  const { t } = useI18n();
  const alerts = useAlerts();
  const assets = useAssets();
  const create = useCreateAlert();
  const remove = useDeleteAlert();
  const [assetId, setAssetId] = useState("");
  const [direction, setDirection] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [price, setPrice] = useState("");

  const options = assets.data?.assets ?? [];

  return (
    <Card title={t("settings.alerts")}>
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <select className="input" value={assetId || options[0]?.id || ""} onChange={(e) => setAssetId(e.target.value)}>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.symbol}
            </option>
          ))}
        </select>
        <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as "ABOVE" | "BELOW")}>
          <option value="ABOVE">{t("alert.above")}</option>
          <option value="BELOW">{t("alert.below")}</option>
        </select>
        <input className="input num" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        <button
          className="btn-primary"
          disabled={create.isPending || !(assetId || options[0]?.id) || !parseFloat(price)}
          onClick={() => {
            create.mutate({ assetId: assetId || options[0]!.id, direction, price: parseFloat(price) });
            setPrice("");
          }}
        >
          {t("alert.create")}
        </button>
      </div>

      <div className="divide-y divide-line/60">
        {(alerts.data?.alerts ?? []).map((a) => (
          <div key={a.id} className="flex items-center justify-between py-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="num font-semibold">{a.symbol}</span>
              <span className={a.direction === "ABOVE" ? "text-up" : "text-down"}>
                {a.direction === "ABOVE" ? "≥" : "≤"} {fmtPrice(a.price)}
              </span>
              <span className="num text-xs text-muted">now {fmtPrice(a.mark)}</span>
              <span className={cls("badge", a.status === "ACTIVE" ? "bg-amber/15 text-amber" : "bg-slate2 text-muted")}>{a.status}</span>
            </div>
            <button className="btn-ghost py-1 text-xs" onClick={() => remove.mutate(a.id)}>
              {t("common.delete")}
            </button>
          </div>
        ))}
        {(alerts.data?.alerts ?? []).length === 0 && <div className="py-4 text-center text-sm text-muted">{t("settings.noAlerts")}</div>}
      </div>
    </Card>
  );
}

function NotificationsList() {
  const { t } = useI18n();
  const notifications = useNotifications();
  const items = notifications.data?.notifications ?? [];
  return (
    <div className="divide-y divide-line/60">
      {items.map((n) => (
        <div key={n.id} className={cls("py-2", !n.read && "border-l-2 border-accent pl-2")}>
          <div className="text-sm font-medium">{n.title}</div>
          {n.body && <div className="text-xs text-muted">{n.body}</div>}
          <div className="num text-[10px] text-muted">{new Date(n.createdAt).toLocaleString()}</div>
        </div>
      ))}
      {items.length === 0 && <div className="py-4 text-center text-sm text-muted">{t("common.noNotifications")}</div>}
    </div>
  );
}
