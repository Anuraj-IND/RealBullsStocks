"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { MarketClock } from "@/components/terminal/MarketClock";
import { NotificationsBell } from "@/components/ui/NotificationsBell";
import { useAuthStore, useConnectionStore, useUiStore } from "@/lib/store";
import { useBrokerStatus } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cls } from "@/lib/format";
import { ws } from "@/lib/ws";
import { hasStoredSession, getRefreshToken, apiPost } from "@/lib/api";

export function TopBar() {
  const { user, activeAccountId, clear } = useAuthStore();
  const connected = useConnectionStore((s) => s.connected);
  const currency = useUiStore((s) => s.currency);
  const setCurrency = useUiStore((s) => s.setCurrency);
  const { t } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const broker = useBrokerStatus();
  const brokerDown = broker.data ? !broker.data.connected : false;

  useEffect(() => {
    if (activeAccountId) ws.subscribeAccount(activeAccountId);
  }, [activeAccountId]);

  async function logout() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await apiPost("/auth/logout", { refreshToken });
    } catch {
      
    }
    clear();
    window.localStorage.clear();
    window.location.href = "/login";
  }

  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN";
  const adminHref = user?.role === "SUPER_ADMIN" ? "/admin/super" : "/admin/tenant";

  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-line bg-navy2 px-3 py-2 md:gap-4 md:px-4">
        <div className="flex min-w-0 items-center gap-3 md:gap-6">
          <Link href="/terminal" className="shrink-0" title="Go to terminal">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            <NavLink href="/terminal" active={pathname === "/terminal"}>{t("nav.terminal")}</NavLink>
            <NavLink href="/positions" active={pathname === "/positions"}>{t("nav.positions")}</NavLink>
            <NavLink href="/orderbook" active={pathname === "/orderbook"}>{t("nav.orderbook")}</NavLink>
            <NavLink href="/analytics" active={pathname === "/analytics"}>{t("nav.analytics")}</NavLink>
            <NavLink href="/settings" active={pathname === "/settings"}>{t("nav.settings")}</NavLink>
            {isAdmin && <NavLink href={adminHref} active={pathname.startsWith("/admin")}>{t("nav.admin")}</NavLink>}
          </nav>
        </div>

        <div className="flex min-w-0 shrink items-center gap-2 md:gap-4">
          <div className="hidden sm:block">
            <MarketClock />
          </div>
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
          <NotificationsBell />

          <span className={cls("hidden h-2 w-2 md:block", connected ? "bg-lime animate-pulseDot" : "bg-brandbright")} title={connected ? t("top.live") : t("top.connecting")} />

          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="btn-ghost max-w-[110px] truncate py-1.5 text-xs sm:max-w-[160px]" aria-expanded={menuOpen}>
              {user?.displayName || user?.username || user?.email || "Account"}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full z-50 mt-1 w-60 border border-line bg-navy2 shadow-panel">
                  <div className="border-b border-line px-3 py-2">
                    <div className="truncate text-sm font-medium">{user?.displayName || user?.username || "Account"}</div>
                    <div className="num truncate text-xs text-muted">{user?.email}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-accent">{user?.role}</div>
                  </div>
                  <Link href="/settings" className="block px-3 py-2 text-sm transition-colors hover:bg-slate" onClick={() => setMenuOpen(false)}>
                    Profile &amp; settings
                  </Link>
                  <Link href="/positions" className="block px-3 py-2 text-sm transition-colors hover:bg-slate" onClick={() => setMenuOpen(false)}>
                    {t("nav.positions")}
                  </Link>
                  <Link href="/analytics" className="block px-3 py-2 text-sm transition-colors hover:bg-slate" onClick={() => setMenuOpen(false)}>
                    {t("nav.analytics")}
                  </Link>
                  <Link href="/orderbook" className="block px-3 py-2 text-sm transition-colors hover:bg-slate" onClick={() => setMenuOpen(false)}>
                    {t("nav.orderbook")}
                  </Link>
                  {isAdmin && (
                    <Link href={adminHref} className="block border-t border-line px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-slate" onClick={() => setMenuOpen(false)}>
                      {user?.role === "SUPER_ADMIN" ? "Super Admin Panel" : "Tenant Admin Panel"}
                    </Link>
                  )}
                  <button
                    onClick={() => void logout()}
                    className="block w-full border-t border-line px-3 py-2 text-left text-sm text-brandbright transition-colors hover:bg-slate"
                  >
                    {t("top.signout")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {brokerDown && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 bg-brand/25 px-4 py-1 text-center text-[11px] font-medium text-brandbright">
          <span>Market is not live yet.</span>
          {user?.role === "SUPER_ADMIN" ? (
            <Link href="/settings" className="underline underline-offset-2">
              Connect market data
            </Link>
          ) : (
            <span className="text-muted">Please wait for the administrator to connect market data.</span>
          )}
        </div>
      )}
      {!connected && (
        <div className="bg-brand/25 px-4 py-1 text-center text-[11px] font-medium text-brandbright">
          {t("top.connecting")}
        </div>
      )}
    </>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cls("tab", active && "tab-active")}>
      {children}
    </Link>
  );
}

export function useEnsureSession() {
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!user && !hasStoredSession()) {
      window.location.href = "/login";
    }
  }, [user]);
}
