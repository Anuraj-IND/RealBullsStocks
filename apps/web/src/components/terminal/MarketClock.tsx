"use client";

import { useEffect, useState } from "react";


export function MarketClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="text-xs text-muted">--:--:--</span>;

  const ist = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  const local = now.toLocaleTimeString([], { hour12: false });

  return (
    <div className="hidden items-center gap-3 text-xs lg:flex">
      <span className="text-muted">
        NSE <span className="num text-ink">{ist}</span> <span className="text-[10px] text-muted">IST</span>
      </span>
      <span className="text-muted">
        Local <span className="num text-ink">{local}</span>
      </span>
    </div>
  );
}
