"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import AdminConsole from "@/components/admin/AdminConsole";

/**
 * Tenant-admin panel: scoped to the users this admin personally created.
 * The API enforces the same boundary server-side, so the UI is a convenience
 * layer rather than the security boundary.
 */
export default function TenantAdminPanel() {
  const user = useAuthStore((s) => s.user);
  const sessionChecked = useAuthStore((s) => s.sessionChecked);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!user) {
      window.location.href = "/";
      return;
    }
    if (user.role !== "TENANT_ADMIN") {
      window.location.href = user.role === "SUPER_ADMIN" ? "/admin/super" : "/";
    }
  }, [sessionChecked, user]);

  if (!sessionChecked) return <div className="p-8 text-muted">Loading session…</div>;
  if (!user || user.role !== "TENANT_ADMIN") return <div className="p-8 text-muted">Redirecting…</div>;

  return <AdminConsole />;
}
