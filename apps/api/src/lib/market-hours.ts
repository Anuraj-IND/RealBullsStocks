import type { Asset } from "@realbulls/db";
import { isNseTradingHoliday } from "@realbulls/shared";


// Local session rules are the last-resort fallback. NSE status comes from the
// broker/exchange status API (see market-status.service.ts); the holiday list
// below is only used when that API and its cache are both unavailable.
function localClock(nowMs: number, offsetMinutes: number): { minutes: number; day: number } {
  const d = new Date(nowMs + offsetMinutes * 60000);
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.getUTCDay() };
}

function localDateKey(nowMs: number, offsetMinutes: number): string {
  const d = new Date(nowMs + offsetMinutes * 60000);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

const IST = 330; 
const ET = -300; 

export function isMarketOpen(
  asset: Pick<Asset, "assetClass" | "quoteCurrency" | "segment">,
  nowMs: number = Date.now(),
): boolean {
  const cls = asset.assetClass as string;

  if (cls === "CRYPTO") return true;

  // MCX commodity derivatives trade 9:00-23:30 IST, Mon-Fri. Other
  // commodities keep the coarse weekday rule.
  if ((asset.segment ?? "").toUpperCase().startsWith("MCX")) {
    const { minutes, day } = localClock(nowMs, IST);
    if (day < 1 || day > 5) return false;
    return minutes >= 9 * 60 && minutes < 23 * 60 + 30;
  }

  if (cls === "FOREX" || cls === "COMMODITY") {
    const { day } = localClock(nowMs, 0);
    return day >= 1 && day <= 5; 
  }

  if (cls === "INDEX" || cls === "STOCK") {
    const indian = asset.quoteCurrency === "INR";
    const offset = indian ? IST : ET;
    const { minutes, day } = localClock(nowMs, offset);
    if (day < 1 || day > 5) return false;
    if (indian) {
      if (isNseTradingHoliday(localDateKey(nowMs, offset))) return false;
      return minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
    }
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  }

  return true;
}
