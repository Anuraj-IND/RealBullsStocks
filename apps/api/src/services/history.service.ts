import type { Timeframe } from "@realbulls/db";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";
import { redis } from "../lib/redis.js";

const KITE_HISTORICAL_URL = "https://api.kite.trade/instruments/historical";

// Backfills intraday candles for Kite-fed derivative assets from the broker's
// historical API (the app's Kite plan includes historical data). The live
// candle worker only builds bars forward from the moment quotes start
// flowing, so a newly added contract (e.g. an MCX future) would otherwise
// show an empty chart for days. Minute bars are fetched once and the larger
// frames are aggregated locally to match the worker's UTC-epoch buckets.

const FRAMES: Array<{ tf: Timeframe; secs: number }> = [
  { tf: "M1", secs: 60 },
  { tf: "M5", secs: 300 },
  { tf: "M15", secs: 900 },
  { tf: "H1", secs: 3600 },
];

const LOOKBACK_DAYS = 7;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface MinuteBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchMinuteBars(instrumentToken: string, token: string): Promise<MinuteBar[]> {
  const to = new Date();
  const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const url =
    `${KITE_HISTORICAL_URL}/${encodeURIComponent(instrumentToken)}/minute` +
    `?from=${dayKey(from)}&to=${dayKey(to)}&continuous=0&oi=0`;
  const res = await fetch(url, {
    headers: { "X-Kite-Version": "3", Authorization: `token ${env.zerodha.apiKey}:${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`historical fetch failed: ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    data?: { candles?: Array<[string, number, number, number, number, number]> };
  };
  const rows = data.data?.candles ?? [];
  const out: MinuteBar[] = [];
  for (const [date, open, high, low, close, volume] of rows) {
    const ts = Date.parse(date);
    if (!Number.isFinite(ts) || ![open, high, low, close].every((v) => Number.isFinite(v))) continue;
    out.push({ ts, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function aggregate(bars: MinuteBar[], secs: number) {
  const groups = new Map<number, MinuteBar[]>();
  for (const b of bars) {
    const bucket = Math.floor(b.ts / 1000 / secs) * secs * 1000;
    const g = groups.get(bucket);
    if (g) g.push(b);
    else groups.set(bucket, [b]);
  }
  return [...groups.entries()].map(([bucket, g]) => ({
    bucket: new Date(bucket),
    open: g[0]!.open,
    high: Math.max(...g.map((x) => x.high)),
    low: Math.min(...g.map((x) => x.low)),
    close: g[g.length - 1]!.close,
    volume: g.reduce((s, x) => s + x.volume, 0),
  }));
}

export async function backfillHistory(assetId: string): Promise<{ asset: string; m1: number }> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("Asset not found");
  if (!asset.instrumentToken) throw new Error("Asset has no instrument token");
  if (!env.zerodha.apiKey) throw new Error("Market data is not configured");
  const token = await redis.get("zerodha:access_token");
  if (!token) throw new Error("Broker is not connected");

  const minute = await fetchMinuteBars(asset.instrumentToken, token);
  for (const { tf, secs } of FRAMES) {
    const rows =
      tf === "M1"
        ? minute.map((b) => ({
            bucket: new Date(Math.floor(b.ts / 1000 / secs) * secs * 1000),
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          }))
        : aggregate(minute, secs);
    for (let i = 0; i < rows.length; i += 1000) {
      await prisma.candle.createMany({
        data: rows.slice(i, i + 1000).map((r) => ({ ...r, assetId: asset.id, timeframe: tf })),
        skipDuplicates: true,
      });
    }
  }
  return { asset: asset.symbol, m1: minute.length };
}
