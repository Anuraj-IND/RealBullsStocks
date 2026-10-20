"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { adminHomePath } from "@/components/admin/AdminConsole";

/**
 * Role-based admin dispatcher.
 *
 * Sends each admin to the panel that matches their role:
 *   SUPER_ADMIN  -> /admin/super
 *   TENANT_ADMIN -> /admin/tenant
 *
 * Non-admins are bounced to the terminal.
 */
export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const sessionChecked = useAuthStore((s) => s.sessionChecked);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "TENANT_ADMIN")) {
      window.location.href = "/";
      return;
    }
    window.location.href = adminHomePath(user.role);
  }, [sessionChecked, user]);

  if (!sessionChecked) return <div className="p-8 text-muted">Loading session...</div>;
  return <div className="p-8 text-muted">Redirecting...</div>;
}
