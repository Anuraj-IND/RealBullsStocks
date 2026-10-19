import type { Asset } from "@realbulls/db";


function localClock(nowMs: number, offsetMinutes: number): { minutes: number; day: number } {
  const d = new Date(nowMs + offsetMinutes * 60000);
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.getUTCDay() };
}

const IST = 330; 
const ET = -300; 

export function isMarketOpen(
  asset: Pick<Asset, "assetClass" | "quoteCurrency" | "segment">,
  nowMs: number = Date.now(),
): boolean {
  const cls = asset.assetClass as string;

  if (cls === "CRYPTO") return true;

  if (cls === "FOREX" || cls === "COMMODITY") {
    const { day } = localClock(nowMs, 0);
    return day >= 1 && day <= 5; 
  }

  if (cls === "INDEX" || cls === "STOCK") {
    const indian = asset.quoteCurrency === "INR";
    const { minutes, day } = localClock(nowMs, indian ? IST : ET);
    if (day < 1 || day > 5) return false;
    if (indian) return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30; 
    return minutes >= 9 * 60 + 30 && minutes <= 16 * 60; 
  }

  return true;
}
