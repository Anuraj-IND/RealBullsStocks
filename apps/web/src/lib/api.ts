export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "realbulls.live";

const TENANT_KEY = "rb_tenant";

export function setTenantSlug(slug: string | null): void {
  if (typeof window === "undefined") return;
  if (slug) window.localStorage.setItem(TENANT_KEY, slug);
  else window.localStorage.removeItem(TENANT_KEY);
}

export function getTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("tenant");
    if (q && /^[a-z0-9-]+$/i.test(q)) {
      window.localStorage.setItem(TENANT_KEY, q);
      return q;
    }
    if (window.location.pathname.startsWith("/login")) return null;
    const stored = window.localStorage.getItem(TENANT_KEY);
    if (stored) return stored;
    const host = window.location.hostname;
    const root = ROOT_DOMAIN.replace(/^\./, "");
    if (host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      if (sub && sub !== "www") return sub;
    }
    const m = /^([a-z0-9-]+)\.(local|localhost|test)$/i.exec(host);
    if (m && m[1] !== "www") return m[1];
  } catch {
    return null;
  }
  return null;
}


export function resolveWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit && /^wss?:\/\//i.test(explicit)) {
    const base = explicit.replace(/\/$/, "");
    return base.endsWith("/ws") ? base : `${base}/ws`;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return `${(explicit ?? "").replace(/\/$/, "")}/ws`;
}

const ACCESS_KEY = "rb_access";
const REFRESH_KEY = "rb_refresh";

export function getAccessToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(REFRESH_KEY);
}


export function hasStoredSession(): boolean {
  return typeof window === "undefined" ? false : Boolean(window.localStorage.getItem(ACCESS_KEY) || window.localStorage.getItem(REFRESH_KEY));
}

export function setTokens(access: string, refresh?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const tenant = getTenantSlug();
  if (tenant && !headers.has("x-tenant")) headers.set("x-tenant", tenant);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    const ok = await tryRefresh();
    if (ok) return api<T>(path, init, true);
    clearTokens();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Session expired");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const payload = data as { message?: string; error?: string } | null;
    throw new ApiError(res.status, (payload && (payload.message || payload.error)) || res.statusText, data);
  }
  return data as T;
}

let refreshInFlight: Promise<boolean> | null = null;


async function tryRefresh(): Promise<boolean> {
  const refresh = typeof window !== "undefined" ? window.localStorage.getItem(REFRESH_KEY) : null;
  if (!refresh) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken) return false;
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });


export async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const tenant = getTenantSlug();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers["x-tenant"] = tenant;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new ApiError(res.status, "Export failed");
  const text = await res.text();
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
