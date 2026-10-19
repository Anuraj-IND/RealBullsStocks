"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ws } from "@/lib/ws";
import { api, ApiError, hasStoredSession, clearTokens, setTokens, setTenantSlug } from "@/lib/api";
import { useAuthStore, toast, type AccountInfo, type AuthUser, type TenantInfo } from "@/lib/store";
import { Toasts } from "@/components/ui/Toasts";
import { I18nProvider } from "@/lib/i18n";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5000 } } }));
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const markSessionChecked = useAuthStore((s) => s.markSessionChecked);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
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
    const off = ws.onMessage((m) => {
      if (m.op === "notification") {
        toast.info(m.data.title, m.data.body ?? undefined);
        client.invalidateQueries({ queryKey: ["notifications"] });
      }
    });
    return () => {
      off();
      ws.close();
    };
  }, [setSession, clear, client]);

  useEffect(() => {
    if (user) ws.subscribeUser(user.id);
  }, [user]);

  return (
    <I18nProvider>
      <QueryClientProvider client={client}>
        {children}
        <Toasts />
      </QueryClientProvider>
    </I18nProvider>
  );
}

export { setTokens };
