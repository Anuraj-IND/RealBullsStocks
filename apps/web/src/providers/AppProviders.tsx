"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ws } from "@/lib/ws";
import { api, ApiError, hasStoredSession, clearTokens, setTokens, setTenantSlug } from "@/lib/api";
import { useQuoteCurrencyMap } from "@/lib/hooks";
import { renderNotifBody } from "@/lib/notifications";
import { useAuthStore, useUiStore, toast, type AccountInfo, type AuthUser, type TenantInfo } from "@/lib/store";
import { Toasts } from "@/components/ui/Toasts";
import { I18nProvider } from "@/lib/i18n";

function NotificationToasts({ client }: { client: QueryClient }) {
  // Must live INSIDE QueryClientProvider: it reads the assets cache, and
  // data hooks above the provider crash the whole tree (useQuery, no client).
  const qcMap = useQuoteCurrencyMap();
  const qcRef = useRef(qcMap);
  qcRef.current = qcMap;
  useEffect(() => {
    const off = ws.onMessage((m) => {
      if (m.op === "notification") {
        const body = renderNotifBody(m.data, qcRef.current) ?? m.data.body ?? undefined;
        toast.info(m.data.title, body);
        client.invalidateQueries({ queryKey: ["notifications"] });
      }
    });
    return () => {
      off();
    };
  }, [client]);
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5000 } } }));
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const markSessionChecked = useAuthStore((s) => s.markSessionChecked);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    useUiStore.getState().hydrateUi();
    ws.connect();
    if (hasStoredSession()) {
      api<{ user: AuthUser; tenant: TenantInfo | null; accounts: AccountInfo[] }>("/me")
        .then((me) => {
          setTenantSlug(me.tenant?.slug ?? null);
          setSession(me);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            clearTokens();
            clear();
          }
        })
        .finally(() => markSessionChecked());
    } else {
      markSessionChecked();
    }
    return () => {
      ws.close();
    };
  }, [setSession, clear]);

  useEffect(() => {
    if (user) ws.subscribeUser(user.id);
  }, [user]);

  return (
    <I18nProvider>
      <QueryClientProvider client={client}>
        {children}
        <Toasts />
        <NotificationToasts client={client} />
      </QueryClientProvider>
    </I18nProvider>
  );
}

export { setTokens };
