import { NextResponse, type NextRequest } from "next/server";

/**
 * The API base baked into the client bundle is the relative "/api"
 * (infra/Dockerfile.web builds with `NEXT_PUBLIC_API_URL=/api`, the
 * docker-compose default).
 *
 * Behind Caddy that works: `handle_path /api/*` reverse-proxies to `api:4000`.
 * But when the web container is reached directly (http://localhost:3000) or the
 * proxy is absent, nothing serves `/api/*` — Next answers 404 and every API
 * call surfaces as a bare "Not Found" on the login screen.
 *
 * Proxy it here so the same-origin "/api" base works through either entry
 * point. This runs per-request, so it resolves the container's runtime
 * API_INTERNAL_URL instead of baking a build-time host into the image.
 */
function apiProxyTarget(request: NextRequest): URL | null {
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return null;
  const base = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/+$/, "");
  return new URL(`${base}${pathname.slice("/api".length)}${search}`);
}

export function middleware(request: NextRequest) {
  const target = apiProxyTarget(request);
  if (target) return NextResponse.rewrite(target);

  const response = NextResponse.next();
  const host = (request.headers.get("host") ?? "").split(":")[0]!;
  const rootDomain = process.env.ROOT_DOMAIN ?? "realbulls.local";

  const suffix = `.${rootDomain}`;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    if (sub && sub !== "www") response.headers.set("x-tenant", sub);
  }
  response.headers.set("x-tenant-host", host);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"],
};
