"use client";

import { useEffect } from "react";
import { setTokens } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";

export default function OAuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get("access");
    const refresh = params.get("refresh");
    if (access) {
      setTokens(access, refresh ?? undefined);
      window.location.href = "/terminal";
    } else {
      window.location.href = "/login?error=oauth";
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo />
      <p className="text-sm text-muted">Signing you in…</p>
    </div>
  );
}
