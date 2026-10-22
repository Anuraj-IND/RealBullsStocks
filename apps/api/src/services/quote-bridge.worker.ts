import { env } from "../env.js";
import { priceKey, redis, tickChannel } from "../lib/redis.js";

// Fallback Kite quote poller that runs inside the API.
//
// The Go ws-gateway is the primary publisher of `realbulls:price:*` ticks.
// When it cannot reach api.kite.trade (e.g. broken container DNS it never
// logs about), Indian instruments go dark even though search, registry and
// the broker token are all healthy. This worker detects that per symbol —
// a price snapshot older than STALE_MS (or missing) while a broker token
// exists — and backfills it with the same dual-write the gateway uses
// (PUBLISH ticks:<SYM> + SET realbulls:price:<SYM>), so watchlists, charts,
// the P&L worker and the candle worker keep working.
//
// Cadence: STALE_MS is deliberately BELOW the poll interval, so every cycle
// refreshes every registered symbol — quotes reach Redis (and the browser,
// via the gateway's instant `ticks:*` fanout) at most one poll old. When the
// gateway is healthy its own fresher snapshots win and this worker's writes
// are just idempotent refreshes of the same data.

const BRIDGE_POLL_MS = env.quoteBridgePollMs;
const STALE_MS = env.quoteBridgeStaleMs;
const KITE_QUOTE_URL = "https://api.kite.trade/quote";
const KITE_MAX_PER_CALL = 500;
// Kite's quote endpoint is rate-limited; pause between chunks so a large
// registry can never fire a burst of back-to-back calls.
const KITE_CHUNK_GAP_MS = 250;
const HALF_SPREAD = 0.3 / 10000;

interface RegistryAsset {
  symbol?: string;
  instrumentToken?: string;
  exchange?: string;
  tradingsymbol?: string;
}

function pricePlaces(symbol: string): number {
  switch (symbol) {
    case "USDJPY":
      return 3;
    case "XAUUSD":
      return 2;
    case "XAGUSD":
      return 3;
    case "USOIL":
      return 2;
    case "US500":
    case "NAS100":
      return 1;
    default:
      if (symbol.length === 6) return 5;
      return 2;
  }
}

function round(v: number, places: number): number {
  const p = 10 ** places;
  return Math.round(v * p) / p;
}

// Kite sends "2026-10-21 22:58:22" in IST without an offset marker.
function kiteTimestamp(raw: string | undefined): number {
  if (!raw) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (m) {
    const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - 19800000;
    if (Number.isFinite(ms)) return ms;
  }
  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? fallback : 0;
}

// Skip overlapping cycles: a slow Kite response must not stack a second
// fetch on top of a still-running one (setInterval is fire-and-forget).
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const apiKey = env.zerodha.apiKey;
    if (!apiKey || !env.zerodha.apiSecret) return;
    const token = await redis.get("zerodha:access_token");
    if (!token) return;

    const rawReg = await redis.get(env.registryKey);
    if (!rawReg) return;
    let assets: RegistryAsset[];
    try {
      assets = (JSON.parse(rawReg) as { assets?: RegistryAsset[] }).assets ?? [];
    } catch {
      return;
    }

    const wanted: { reqKey: string; symbol: string }[] = [];
    const byKey = new Map<string, string>();
    for (const a of assets) {
      const symbol = (a.symbol ?? "").toUpperCase();
      const key =
        a.exchange && a.tradingsymbol ? `${a.exchange}:${a.tradingsymbol}` : (a.instrumentToken ?? "");
      if (!key || !symbol) continue;
      byKey.set(key, symbol);
      if (a.instrumentToken) byKey.set(a.instrumentToken, symbol);
      wanted.push({ reqKey: key, symbol });
    }
    if (wanted.length === 0) return;

    const snaps = await redis.mget(wanted.map((w) => priceKey(w.symbol)));
    const now = Date.now();
    const stale = wanted.filter((w, i) => {
      const raw = snaps[i];
      if (!raw) return true;
      try {
        const ts = (JSON.parse(raw) as { ts?: number }).ts;
        return typeof ts !== "number" || now - ts > STALE_MS;
      } catch {
        return true;
      }
    });
    if (stale.length === 0) return;

    for (let s = 0; s < stale.length; s += KITE_MAX_PER_CALL) {
      if (s > 0) await new Promise((r) => setTimeout(r, KITE_CHUNK_GAP_MS));
      const chunk = stale.slice(s, s + KITE_MAX_PER_CALL);
      const params = new URLSearchParams();
      for (const w of chunk) params.append("i", w.reqKey);
      const res = await fetch(`${KITE_QUOTE_URL}?${params.toString()}`, {
        headers: { "X-Kite-Version": "3", Authorization: `token ${apiKey}:${token}` },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        status?: string;
        data?: Record<string, { last_price?: number; last_trade_time?: string; timestamp?: string }>;
      };
      if (!data.data) continue;

      const pipe = redis.pipeline();
      let published = 0;
      for (const [instr, qd] of Object.entries(data.data)) {
        const internal =
          byKey.get(instr) ?? byKey.get(instr.toUpperCase()) ?? [...byKey].find(([k]) => k.toLowerCase() === instr.toLowerCase())?.[1];
        const last = qd.last_price ?? 0;
        if (!internal || last <= 0) continue;
        const places = pricePlaces(internal);
        const ts = kiteTimestamp(qd.last_trade_time) || kiteTimestamp(qd.timestamp);
        // Never stamp "now" on a quoteless response: a fresh ts on a stale
        // price would pass the STALE_QUOTE gate and allow fills on dead data.
        // Skipping keeps the last honest snapshot (with its real age).
        if (!ts) continue;
        const payload = JSON.stringify({
          symbol: internal,
          bid: round(last * (1 - HALF_SPREAD), places),
          ask: round(last * (1 + HALF_SPREAD), places),
          mid: round(last, places),
          ts,
        });
        pipe.publish(tickChannel(internal), payload);
        pipe.set(priceKey(internal), payload);
        published++;
      }
      if (published > 0) await pipe.exec();
    }
  } catch (err) {
    console.error("[quote-bridge] tick failed", err instanceof Error ? err.message : err);
  } finally {
    inFlight = false;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startQuoteBridge(): void {
  if (timer) return;
  console.log(`[quote-bridge] started (${BRIDGE_POLL_MS}ms, stale>${STALE_MS}ms)`);
  timer = setInterval(() => void tick(), BRIDGE_POLL_MS);
}

export function stopQuoteBridge(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
