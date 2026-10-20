/**
 * NSE/BSE trading holidays for calendar year 2026.
 * Source: NSE circular NSE/CMTR/71775 dated 12 December 2025.
 * Dates are exchange-local (Asia/Kolkata) calendar dates in YYYY-MM-DD form.
 *
 * Fallback only. The live market status is fetched from the NSE status API and
 * cached; this list is used when that API and the cached calendar are missing.
 */
export const NSE_TRADING_HOLIDAYS_2026: readonly string[] = [
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-05-28",
  "2026-06-26",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24",
  "2026-12-25",
];

export const NSE_TRADING_HOLIDAYS = NSE_TRADING_HOLIDAYS_2026;

const NSE_HOLIDAY_SET = new Set(NSE_TRADING_HOLIDAYS);

export function isNseTradingHoliday(dateKey: string): boolean {
  return NSE_HOLIDAY_SET.has(dateKey);
}
