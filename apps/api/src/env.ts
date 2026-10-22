import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4000),
  rootDomain: process.env.ROOT_DOMAIN ?? "realbulls.local",
  databaseUrl: req("DATABASE_URL", "postgresql://realbulls:realbulls@localhost:5432/realbulls?schema=public"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwt: {
    accessSecret: new TextEncoder().encode(req("JWT_ACCESS_SECRET", "change-me-access-secret-change-me")),
    refreshSecret: new TextEncoder().encode(req("JWT_REFRESH_SECRET", "change-me-refresh-secret-change-me")),
    accessTtl: Number(process.env.JWT_ACCESS_TTL ?? 900),
    refreshTtl: Number(process.env.JWT_REFRESH_TTL ?? 1209600),
  },
  pnlTickMs: Number(process.env.PNL_TICK_MS ?? 1000),
  // Minimum holding period: a manually closed position must be at least this
  // old, otherwise the close is rejected with the remaining wait. By close
  // time quotes have refreshed, so stale ticks can't be exploited.
  // Risk-engine closes (SL/TP, liquidation, auto-close) bypass the gate.
  minHoldMs: Number(process.env.MIN_HOLD_MS ?? "15000"),
  registryKey: process.env.REGISTRY_KEY ?? "realbulls:registry",
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    apiBase: process.env.PUBLIC_API_BASE ?? `http://localhost:${process.env.API_PORT ?? 4000}`,
    webUrl: process.env.PUBLIC_WEB_URL ?? "http://localhost:3000",
  },
  zerodha: {
    apiKey: process.env.ZERODHA_API_KEY ?? "",
    apiSecret: process.env.ZERODHA_API_SECRET ?? "",
    redirect: process.env.ZERODHA_REDIRECT ?? `${process.env.PUBLIC_API_BASE ?? "http://localhost:4000"}/broker/zerodha/callback`,
  },
  allowSignup: (process.env.ALLOW_SIGNUP ?? "true") === "true",
  signupStartingBalance: Number(process.env.SIGNUP_STARTING_BALANCE ?? 8350000),
  // Foreign-quote → ₹ rate for market data and display (ledger is ₹).
  usdInr: Number(process.env.USD_INR ?? "83.5"),
  // Quote-bridge cadence: poll Kite every POLL ms, refreshing every cached
  // snapshot older than STALE ms. The Kite WS ticker (gateway) keeps live
  // symbols <1s fresh, so STALE sits well above it — the bridge only
  // backfills symbols the ticker isn't feeding (disconnected, unsubscribed,
  // closed markets). 2s ≈ 0.5 quote req/s worst-case, inside Kite's limits.
  quoteBridgePollMs: Math.max(Number(process.env.QUOTE_BRIDGE_POLL_MS ?? 2000) || 2000, 1000),
  quoteBridgeStaleMs: Math.max(Number(process.env.QUOTE_BRIDGE_STALE_MS ?? 8000) || 8000, 1000),
  // Login brute-force guard: N failed attempts per identifier+IP locks logins
  // for 15 min. Disable locally with LOGIN_RATE_LIMIT=false while testing
  // logins across many accounts.
  loginRateLimit: (process.env.LOGIN_RATE_LIMIT ?? "true") !== "false",
  isProd: (process.env.NODE_ENV ?? "development") === "production",
};

export type Env = typeof env;


