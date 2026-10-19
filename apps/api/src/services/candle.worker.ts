import type { Timeframe } from "@realbulls/db";
import { prisma } from "../lib/prisma.js";
import { getQuote } from "./market.service.js";

const FRAMES: Array<{ tf: Timeframe; secs: number }> = [
  { tf: "M1", secs: 60 },
  { tf: "M5", secs: 300 },
  { tf: "M15", secs: 900 },
  { tf: "H1", secs: 3600 },
];

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  const assets = await prisma.asset.findMany({ where: { enabled: true }, select: { id: true, symbol: true } });
  const now = Date.now();

  for (const a of assets) {
    const q = await getQuote(a.symbol);
    if (!q) continue;

    for (const { tf, secs } of FRAMES) {
      const bucket = new Date(Math.floor(now / 1000 / secs) * secs * 1000);
      const existing = await prisma.candle.findUnique({
        where: { assetId_timeframe_bucket: { assetId: a.id, timeframe: tf, bucket } },
      }).catch(() => null);

      if (!existing) {
        await prisma.candle
          .create({ data: { assetId: a.id, timeframe: tf, bucket, open: q.mid, high: q.mid, low: q.mid, close: q.mid, volume: 1 } })
          .catch(() => undefined);
      } else {
        await prisma.candle
          .update({
            where: { id: existing.id },
            data: {
              high: Math.max(Number(existing.high), q.mid),
              low: Math.min(Number(existing.low), q.mid),
              close: q.mid,
              volume: { increment: 1 },
            },
          })
          .catch(() => undefined);
      }
    }
  }
}

export function startCandleWorker(): void {
  if (timer) return;
  console.log("[candle.worker] started (2s)");
  timer = setInterval(() => void tick().catch(() => undefined), 2000);
}

export function stopCandleWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
