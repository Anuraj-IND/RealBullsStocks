"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import AdminConsole from "@/components/admin/AdminConsole";

/**
 * Super-admin panel: full platform control (tenants, admins, risk, everything).
 * Tenant admins are redirected to their own scoped panel.
 */
export default function SuperAdminPanel() {
  const user = useAuthStore((s) => s.user);
  const sessionChecked = useAuthStore((s) => s.sessionChecked);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!user) {
      window.location.href = "/";
      return;
    }
    if (user.role !== "SUPER_ADMIN") {
      window.location.href = "/admin/tenant";
    }
  }, [sessionChecked, user]);

  if (!sessionChecked) return <div className="p-8 text-muted">Loading session…</div>;
  if (!user || user.role !== "SUPER_ADMIN") return <div className="p-8 text-muted">Redirecting…</div>;

  return <AdminConsole />;
}
