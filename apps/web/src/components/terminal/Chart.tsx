"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useSymbolStats, useUiStore } from "@/lib/store";
import { useAssets } from "@/lib/hooks";
import { apiGet } from "@/lib/api";
import { cls } from "@/lib/format";

type ChartKind = "candles" | "heikin" | "line";

const TIMEFRAMES = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
] as const;


function serverTf(seconds: number): string | null {
  if (seconds === 60) return "M1";
  if (seconds === 300) return "M5";
  if (seconds === 900) return "M15";
  if (seconds === 3600) return "H1";
  return null;
}

function precisionFor(symbol: string): number {
  if (symbol === "USDJPY") return 3;
  if (["XAUUSD", "XAGUSD", "USOIL", "US500", "NAS100"].includes(symbol)) return 2;
  if (symbol.length === 6) return 5;
  return 2;
}

function priceFormat(precision: number) {
  return { type: "price" as const, precision, minMove: 1 / Math.pow(10, precision) };
}

export function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const bucketRef = useRef<{ time: number; o: number; h: number; l: number; c: number } | null>(null);
  const haRef = useRef<{ open: number; close: number } | null>(null);
  const lastHistoricalRef = useRef<{ time: number; close: number } | null>(null);

  const symbol = useUiStore((s) => s.activeSymbol);
  const { tick } = useSymbolStats(symbol);
  const assets = useAssets();
  const asset = assets.data?.assets.find((a) => a.symbol === symbol);
  const assetId = asset?.id;
  const [kind, setKind] = useState<ChartKind>("candles");
  const [tf, setTf] = useState<number>(60);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    import("@/lib/ws").then(({ ws }) => ws.subscribeSymbols([symbol]));
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;
    bucketRef.current = null;
    haRef.current = null;
    lastHistoricalRef.current = null;
    setEmpty(true);

    const precision = precisionFor(symbol);
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7C8EA8",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(26,36,51,0.6)" },
        horzLines: { color: "rgba(26,36,51,0.6)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1A2433" },
      timeScale: { borderColor: "#1A2433", timeVisible: true, secondsVisible: true },
      autoSize: true,
    });
    chartRef.current = chart;

    if (kind === "line") {
      seriesRef.current = chart.addLineSeries({ color: "#6AA8FF", lineWidth: 2 });
    } else {
      seriesRef.current = chart.addCandlestickSeries({
        upColor: "#00E676",
        downColor: "#E0474C",
        borderUpColor: "#00E676",
        borderDownColor: "#E0474C",
        wickUpColor: "#00E676",
        wickDownColor: "#E0474C",
        priceFormat: priceFormat(precision),
      });
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [kind, symbol, tf]);

  useEffect(() => {
    const stf = serverTf(tf);
    if (!assetId || !stf || !seriesRef.current) return;
    let cancelled = false;
    (seriesRef.current as ISeriesApi<"Candlestick">).setData([]);
    bucketRef.current = null;
    haRef.current = null;
    lastHistoricalRef.current = null;
    setEmpty(true);
    apiGet<{ candles: Array<{ time: number; open: number; high: number; low: number; close: number }> }>(
      `/assets/${assetId}/candles?timeframe=${stf}&limit=500`,
    )
      .then((r) => {
        if (cancelled || !seriesRef.current || r.candles.length === 0) return;
        setEmpty(false);
        const last = r.candles[r.candles.length - 1];
        if (last) lastHistoricalRef.current = { time: last.time, close: last.close };
        if (kind === "line") {
          (seriesRef.current as ISeriesApi<"Line">).setData(r.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
        } else {
          (seriesRef.current as ISeriesApi<"Candlestick">).setData(
            r.candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
          );
        }
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [assetId, tf, kind]);

  useEffect(() => {
    if (!tick || !seriesRef.current) return;
    setEmpty(false);
    const t = tick.mid;
    const bucketTime = Math.floor(Date.now() / 1000 / tf) * tf;

    if (kind === "line") {
      (seriesRef.current as ISeriesApi<"Line">).update({ time: bucketTime as UTCTimestamp, value: t });
      return;
    }

    let bucket = bucketRef.current;
    if (!bucket || bucketTime > bucket.time) {
      // Initialize open from last historical candle close (if it's the current bucket)
      // to avoid a price spike/gap between historical and live data
      const lastHist = lastHistoricalRef.current;
      const openPrice = lastHist && bucketTime === lastHist.time ? lastHist.close : t;
      bucket = { time: bucketTime, o: openPrice, h: Math.max(openPrice, t), l: Math.min(openPrice, t), c: t };
    } else {
      bucket.h = Math.max(bucket.h, t);
      bucket.l = Math.min(bucket.l, t);
      bucket.c = t;
    }
    bucketRef.current = bucket;

    if (kind === "heikin") {
      const prevHa = haRef.current;
      const haClose = (bucket.o + bucket.h + bucket.l + bucket.c) / 4;
      const haOpen = prevHa ? (prevHa.open + prevHa.close) / 2 : (bucket.o + bucket.c) / 2;
      haRef.current = { open: haOpen, close: haClose };
      (seriesRef.current as ISeriesApi<"Candlestick">).update({
        time: bucket.time as UTCTimestamp,
        open: haOpen,
        high: Math.max(bucket.h, haOpen, haClose),
        low: Math.min(bucket.l, haOpen, haClose),
        close: haClose,
      });
    } else {
      (seriesRef.current as ISeriesApi<"Candlestick">).update({
        time: bucket.time as UTCTimestamp,
        open: bucket.o,
        high: bucket.h,
        low: bucket.l,
        close: bucket.c,
      });
    }
  }, [tick, kind, tf]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((f) => (
            <button
              key={f.label}
              onClick={() => setTf(f.seconds)}
              className={cls("px-2 py-1 text-xs font-medium", tf === f.seconds ? "text-accent" : "text-muted hover:text-ink")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["candles", "heikin", "line"] as ChartKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cls("px-2 py-1 text-xs", kind === k ? "text-accent" : "text-muted hover:text-ink")}
            >
              {k === "heikin" ? "HA" : k === "candles" ? "Candles" : "Line"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <span className="text-sm font-semibold text-muted">Market is not live yet</span>
            <span className="max-w-xs text-[11px] text-muted">
              Candles build from live ticks only. They will appear once live market data starts.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
