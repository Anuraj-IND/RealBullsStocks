import type { Asset } from "@realbulls/db";
import { NSE_TRADING_HOLIDAYS } from "@realbulls/shared";
import { redis } from "../lib/redis.js";
import { isMarketOpen } from "../lib/market-hours.js";

export type MarketStatusSource = "nse" | "cache" | "schedule";

export interface MarketStatus {
  open: boolean;
  reason: string;
  source: MarketStatusSource;
  asOf: number;
  tradeDate?: string;
}

interface NseHoliday {
  date: string;
  description: string;
}

const NSE_BASE = "https://www.nseindia.com";
const STATUS_KEY = "market:nse:status";
const STATUS_LAST_KEY = "market:nse:status:last";
const HOLIDAYS_KEY = "market:nse:holidays";
const STATUS_TTL_SEC = 60;
const STATUS_LAST_TTL_SEC = 7 * 24 * 60 * 60;
const HOLIDAY_TTL_SEC = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 6000;

const NSE_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/market-data/live-market-indices",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
};

let statusMemo: { value: MarketStatus; expires: number } | null = null;
let holidaysMemo: { value: NseHoliday[]; expires: number } | null = null;

function parseNseDate(value: string): string {
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  const day = match?.[1];
  const monthKey = match?.[2];
  const year = match?.[3];
  if (!day || !monthKey || !year) return "";
  const month = months[monthKey];
  if (!month) return "";
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function istDateKey(nowMs: number): string {
  const d = new Date(nowMs + 330 * 60000);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

async function fetchNseJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${NSE_BASE}${path}`, {
      headers: NSE_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadHolidays(): Promise<NseHoliday[]> {
  const now = Date.now();
  if (holidaysMemo && holidaysMemo.expires > now) return holidaysMemo.value;

  const cached = await redis.get(HOLIDAYS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as NseHoliday[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        holidaysMemo = { value: parsed, expires: now + 5 * 60000 };
        return parsed;
      }
    } catch {
      // Ignore malformed cache.
    }
  }

  const data = await fetchNseJson<Record<string, Array<{ tradingDate?: string; description?: string }>>>(
    "/api/holiday-master?type=trading",
  );
  const rows = data?.CM ?? data?.FO ?? [];
  const holidays = rows
    .map((row) => ({
      date: parseNseDate(row.tradingDate ?? ""),
      description: (row.description ?? "").trim(),
    }))
    .filter((row) => row.date && row.description);

  if (holidays.length > 0) {
    holidaysMemo = { value: holidays, expires: now + 5 * 60000 };
    await redis.set(HOLIDAYS_KEY, JSON.stringify(holidays), "EX", HOLIDAY_TTL_SEC);
    return holidays;
  }

  const fallback = NSE_TRADING_HOLIDAYS.map((date) => ({ date, description: "NSE trading holiday" }));
  holidaysMemo = { value: fallback, expires: now + 5 * 60000 };
  return fallback;
}

export async function getNseTradingHolidays(): Promise<string[]> {
  return (await loadHolidays()).map((holiday) => holiday.date);
}

async function holidayReason(dateKey: string): Promise<string | null> {
  const holidays = await loadHolidays();
  return holidays.find((holiday) => holiday.date === dateKey)?.description ?? null;
}

function scheduleStatus(nowMs: number): MarketStatus {
  const open = isMarketOpen({ assetClass: "INDEX", quoteCurrency: "INR", segment: "" }, nowMs);
  return {
    open,
    reason: open ? "NSE session is open" : "NSE session is closed",
    source: "schedule",
    asOf: nowMs,
  };
}

export async function getNseMarketStatus(nowMs: number = Date.now()): Promise<MarketStatus> {
  if (statusMemo && statusMemo.expires > nowMs) return statusMemo.value;

  const cached = await redis.get(STATUS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as MarketStatus;
      if (typeof parsed.open === "boolean") {
        const value = { ...parsed, source: "cache" as const };
        statusMemo = { value, expires: nowMs + 15000 };
        return value;
      }
    } catch {
      // Ignore malformed cache.
    }
  }

  const data = await fetchNseJson<{
    marketState?: Array<{
      market?: string;
      marketStatus?: string;
      marketStatusMessage?: string;
      tradeDate?: string;
    }>;
  }>("/api/marketStatus");

  const capital = data?.marketState?.find((row) => row.market === "Capital Market");
  if (capital?.marketStatus) {
    const open = capital.marketStatus.trim().toLowerCase() === "open";
    const holiday = open ? null : await holidayReason(istDateKey(nowMs));
    const reason = holiday
      ? `${holiday} — ${capital.marketStatusMessage ?? "Market is Closed"}`
      : capital.marketStatusMessage ?? (open ? "Market is Open" : "Market is Closed");

    const value: MarketStatus = {
      open,
      reason,
      source: "nse",
      asOf: nowMs,
      tradeDate: capital.tradeDate,
    };
    statusMemo = { value, expires: nowMs + STATUS_TTL_SEC * 1000 };
    await redis
      .multi()
      .set(STATUS_KEY, JSON.stringify(value), "EX", STATUS_TTL_SEC)
      .set(STATUS_LAST_KEY, JSON.stringify(value), "EX", STATUS_LAST_TTL_SEC)
      .exec();
    return value;
  }

  const last = await redis.get(STATUS_LAST_KEY);
  if (last) {
    try {
      const parsed = JSON.parse(last) as MarketStatus;
      if (typeof parsed.open === "boolean") {
        const value = { ...parsed, source: "cache" as const };
        statusMemo = { value, expires: nowMs + 30000 };
        return value;
      }
    } catch {
      // Ignore malformed cache.
    }
  }

  const value = scheduleStatus(nowMs);
  statusMemo = { value, expires: nowMs + 30000 };
  return value;
}

function isIndianMarketAsset(asset: Pick<Asset, "assetClass" | "quoteCurrency">): boolean {
  return asset.quoteCurrency === "INR" && (asset.assetClass === "INDEX" || asset.assetClass === "STOCK");
}

export async function marketStatusForAsset(
  asset: Pick<Asset, "assetClass" | "quoteCurrency" | "segment">,
  nowMs: number = Date.now(),
): Promise<MarketStatus> {
  if (isIndianMarketAsset(asset)) return getNseMarketStatus(nowMs);

  const open = isMarketOpen(asset, nowMs);
  return {
    open,
    reason: open ? "Market is open" : "Market is closed",
    source: "schedule",
    asOf: nowMs,
  };
}

export async function isAssetMarketOpen(
  asset: Pick<Asset, "assetClass" | "quoteCurrency" | "segment">,
  nowMs: number = Date.now(),
): Promise<boolean> {
  return (await marketStatusForAsset(asset, nowMs)).open;
}
