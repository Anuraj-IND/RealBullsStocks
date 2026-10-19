import { Redis } from "ioredis";
import { env } from "../env.js";

export const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

redis.on("error", (err) => {
  console.error("[redis] error", err.message);
});

export function tickChannel(symbol: string): string {
  return `ticks:${symbol.toUpperCase()}`;
}

export function priceKey(symbol: string): string {
  return `realbulls:price:${symbol.toUpperCase()}`;
}

export function accountChannel(accountId: string): string {
  return `accounts:${accountId}`;
}

export async function getCachedPrice(symbol: string): Promise<number | null> {
  const raw = await redis.get(priceKey(symbol));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { mid?: number };
    return typeof parsed.mid === "number" ? parsed.mid : null;
  } catch {
    return null;
  }
}
