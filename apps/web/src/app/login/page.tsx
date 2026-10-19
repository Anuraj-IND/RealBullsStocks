"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/components/ui/Logo";
import { Footer } from "@/components/ui/Footer";
import { apiPost, setTokens, setTenantSlug, ApiError } from "@/lib/api";
import { useAuthStore, type AccountInfo, type AuthUser, type TenantInfo } from "@/lib/store";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  tenant: TenantInfo | null;
  accounts: AccountInfo[];
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setError(err === "suspended" ? "Account suspended" : "Sign-in failed. Please try again.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<LoginResponse>("/auth/login", { identifier, password });
      setTokens(res.accessToken, res.refreshToken);
      setTenantSlug(res.tenant?.slug ?? null);
      setSession({ user: res.user, tenant: res.tenant, accounts: res.accounts });
      router.push("/terminal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="panel w-full max-w-md p-8"
        >
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <img src="/brand/logo.svg" alt="Realbulls" className="h-12 w-auto" />
            <div className="font-display text-2xl font-black tracking-tight">
              <span className="text-accent">REAL</span>
              <span className="text-green">BULLS</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-ink">Sign in</h1>
              <p className="text-sm text-muted">Access your trading terminal</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted">User ID or email</label>
              <input
                className="input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="bg-brand/15 px-3 py-2 text-sm text-brandbright">{error}</div>}

            <button className="btn-primary w-full py-2.5" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-xs">
            <Link href="/" className="text-muted transition-colors hover:text-ink">
              Home
            </Link>
            <Link href="/help" className="text-muted transition-colors hover:text-ink">
              Forgot password?
            </Link>
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
