"use client";

import { useEffect, useState } from "react";
import { cls } from "@/lib/format";
import { useNotifications, useMarkNotificationsRead, useDeleteNotification, useClearNotifications } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const del = useDeleteNotification();
  const clear = useClearNotifications();
  const { t } = useI18n();
  const unread = data?.unread ?? 0;
  const items = data?.notifications ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markRead.mutate(undefined);
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="btn-ghost relative py-1.5 text-xs" title={t("common.notifications")} aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="num ml-1 text-amber">{unread}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 border border-line bg-navy2 shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("common.notifications")}</span>
              <div className="flex items-center gap-3">
                <button className="text-[11px] text-accent hover:underline" onClick={() => markRead.mutate(undefined)}>
                  {t("common.markAllRead")}
                </button>
                {items.length > 0 && (
                  <button className="text-[11px] text-muted hover:text-brandbright" onClick={() => clear.mutate()}>
                    {t("common.clearAll")}
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <div key={n.id} className={cls("group flex items-start justify-between gap-2 border-b border-line/60 px-3 py-2", !n.read && "bg-slate/40")}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted">{n.body}</div>}
                    <div className="num mt-0.5 text-[10px] text-muted">{new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => del.mutate(n.id)}
                    className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-brandbright"
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                  >
                    ×
                  </button>
                </div>
              ))}
              {items.length === 0 && <div className="p-4 text-center text-xs text-muted">{t("common.noNotifications")}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
