import { NextResponse, type NextRequest } from "next/server";


export function middleware(request: NextRequest) {
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
