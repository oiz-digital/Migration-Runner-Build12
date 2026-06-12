import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Time,
  type MouseEventParams,
  type LineData,
  type SeriesType,
  LineStyle,
} from "lightweight-charts";
import {
  CandlestickChart,
  LineChart as LineIcon,
  AreaChart,
  BarChart3,
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings2,
  Camera,
  Check,
} from "lucide-react";
import { get } from "@/lib/api";
import { useOhlcv, type Candle } from "@/lib/marketSocket";
import { rsi, macd, bollinger } from "@/lib/indicators";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const INTERVAL_GROUPS: { label: string; items: string[] }[] = [
  { label: "Minutes", items: ["1m", "3m", "5m", "15m", "30m"] },
  { label: "Hours", items: ["1h", "2h", "4h", "6h", "12h"] },
  { label: "Days", items: ["1d", "3d", "1w"] },
];
const QUICK_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Interval = string;

type ChartKind = "candles" | "line" | "area" | "bars";

const CHART_KINDS: { id: ChartKind; label: string; icon: typeof CandlestickChart }[] = [
  { id: "candles", label: "Candles", icon: CandlestickChart },
  { id: "line", label: "Line", icon: LineIcon },
  { id: "area", label: "Area", icon: AreaChart },
  { id: "bars", label: "Bars", icon: BarChart3 },
];

const MA_DEFS: { id: "ma7" | "ma25" | "ma99"; period: number; color: string; label: string }[] = [
  { id: "ma7", period: 7, color: "#facc15", label: "MA 7" },
  { id: "ma25", period: 25, color: "#60a5fa", label: "MA 25" },
  { id: "ma99", period: 99, color: "#f472b6", label: "MA 99" },
];

function sma(values: { time: number; close: number }[], period: number): LineData[] {
  if (values.length < period) return [];
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i].close;
    if (i >= period) sum -= values[i - period].close;
    if (i >= period - 1) {
      out.push({ time: values[i].time as Time, value: sum / period });
    }
  }
  return out;
}

function fmtPrice(n: number, quote: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr = quote === "INR";
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  const prefix = inr ? "₹" : "";
  const suffix = !inr && quote ? ` ${quote}` : "";
  return prefix + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}
function fmtCompact(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

const INDICATOR_KEY = "zebvix:chart:indicators";
const KIND_KEY = "zebvix:chart:kind";

type IndicatorState = {
  ma7: boolean; ma25: boolean; ma99: boolean; volume: boolean;
  bb: boolean; rsi: boolean; macd: boolean;
};
const DEFAULT_INDICATORS: IndicatorState = {
  ma7: true, ma25: true, ma99: false, volume: true,
  bb: false, rsi: true, macd: true,
};

const BB_COLORS = { upper: "#a78bfa", middle: "#a78bfa", lower: "#a78bfa" };
const RSI_PANE_INDEX = 1;
const MACD_PANE_INDEX = 2;

export function PriceChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Main price series (one of: candles / line / area / bars)
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  // Bollinger Bands (3 overlay lines on main pane)
  const bbSeriesRef = useRef<{ upper: ISeriesApi<"Line">; middle: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> } | null>(null);
  // RSI on its own pane (0-100 scale)
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiOverboughtRef = useRef<IPriceLine | null>(null);
  const rsiOversoldRef = useRef<IPriceLine | null>(null);
  // MACD on its own pane: histogram + macd line + signal line
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSigRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const lastTimeRef = useRef<number>(0);
  const candlesRef = useRef<Candle[]>([]);

  const [interval, setInterval] = useState<Interval>("1h");
  const [kind, setKind] = useState<ChartKind>(() => {
    try { return (window.localStorage.getItem(KIND_KEY) as ChartKind) || "candles"; } catch { return "candles"; }
  });
  const [indicators, setIndicators] = useState<IndicatorState>(() => {
    try {
      const raw = window.localStorage.getItem(INDICATOR_KEY);
      if (raw) return { ...DEFAULT_INDICATORS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_INDICATORS;
  });
  const [seedLoaded, setSeedLoaded] = useState(false);
  const [hover, setHover] = useState<{ candle: Candle; pct: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const liveCandles = useOhlcv(symbol, interval);
  const quote = useMemo(() => symbol.split("/")[1] || "USDT", [symbol]);
  const base = useMemo(() => symbol.split("/")[0] || symbol, [symbol]);

  // Persist UI state
  useEffect(() => { try { window.localStorage.setItem(KIND_KEY, kind); } catch { /* ignore */ } }, [kind]);
  useEffect(() => { try { window.localStorage.setItem(INDICATOR_KEY, JSON.stringify(indicators)); } catch { /* ignore */ } }, [indicators]);

  // ── Init chart ──
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "JetBrains Mono, Menlo, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.06)" },
        horzLines: { color: "rgba(148, 163, 184, 0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)", scaleMargins: { top: 0.05, bottom: 0.25 } },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.15)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(245, 158, 11, 0.4)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#f59e0b" },
        horzLine: { color: "rgba(245, 158, 11, 0.4)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#f59e0b" },
      },
      autoSize: true,
    });
    chartRef.current = chart;
    return () => {
      try { chart.remove(); } catch { /* ignore */ }
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRef.current = {};
      bbSeriesRef.current = null;
      rsiSeriesRef.current = null;
      rsiOverboughtRef.current = null;
      rsiOversoldRef.current = null;
      macdHistRef.current = null;
      macdLineRef.current = null;
      macdSigRef.current = null;
      priceLineRef.current = null;
    };
  }, []);

  // ── Crosshair: update OHLC info bar on hover ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: MouseEventParams) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const t = Number(param.time);
      const c = candlesRef.current.find((x) => x.time === t);
      if (!c) { setHover(null); return; }
      const pct = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
      setHover({ candle: c, pct });
    };
    chart.subscribeCrosshairMove(handler);
    return () => { try { chart.unsubscribeCrosshairMove(handler); } catch { /* ignore */ } };
  }, []);

  // ── Recreate main series on kind change ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      try { chart.removeSeries(mainSeriesRef.current); } catch { /* ignore */ }
      mainSeriesRef.current = null;
      priceLineRef.current = null;
    }
    let s: ISeriesApi<SeriesType>;
    switch (kind) {
      case "line":
        s = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2 });
        break;
      case "area":
        s = chart.addSeries(AreaSeries, {
          lineColor: "#f59e0b",
          topColor: "rgba(245, 158, 11, 0.35)",
          bottomColor: "rgba(245, 158, 11, 0.0)",
          lineWidth: 2,
        });
        break;
      case "bars":
        s = chart.addSeries(BarSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          openVisible: true,
          thinBars: false,
        });
        break;
      case "candles":
      default:
        s = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
          borderVisible: false,
        });
        break;
    }
    mainSeriesRef.current = s;
    // Replay current candles into the new series
    if (candlesRef.current.length > 0) {
      applyCandlesToMain(candlesRef.current, kind, s);
      const last = candlesRef.current[candlesRef.current.length - 1];
      ensurePriceLine(s, last.close, last.close >= last.open);
    }
  }, [kind]);

  // ── Volume series ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.volume) {
      if (!volumeSeriesRef.current) {
        const v = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: "rgba(34, 197, 94, 0.5)",
        });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
        volumeSeriesRef.current = v;
        if (candlesRef.current.length > 0) applyVolume(candlesRef.current, v);
      }
    } else if (volumeSeriesRef.current) {
      try { chart.removeSeries(volumeSeriesRef.current); } catch { /* ignore */ }
      volumeSeriesRef.current = null;
    }
  }, [indicators.volume]);

  // ── MA series ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const def of MA_DEFS) {
      const enabled = indicators[def.id];
      const existing = maSeriesRef.current[def.id];
      if (enabled && !existing) {
        const s = chart.addSeries(LineSeries, {
          color: def.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        maSeriesRef.current[def.id] = s;
        if (candlesRef.current.length > 0) {
          s.setData(sma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), def.period));
        }
      } else if (!enabled && existing) {
        try { chart.removeSeries(existing); } catch { /* ignore */ }
        delete maSeriesRef.current[def.id];
      }
    }
  }, [indicators.ma7, indicators.ma25, indicators.ma99]);

  // ── Bollinger Bands (overlay on main pane) ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.bb) {
      if (!bbSeriesRef.current) {
        const common = {
          lineWidth: 1 as const,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        };
        const upper = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.upper });
        const middle = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.middle, lineStyle: LineStyle.Dashed });
        const lower = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.lower });
        bbSeriesRef.current = { upper, middle, lower };
        if (candlesRef.current.length > 0) applyBollinger(candlesRef.current, bbSeriesRef.current);
      }
    } else if (bbSeriesRef.current) {
      try { chart.removeSeries(bbSeriesRef.current.upper); } catch { /* ignore */ }
      try { chart.removeSeries(bbSeriesRef.current.middle); } catch { /* ignore */ }
      try { chart.removeSeries(bbSeriesRef.current.lower); } catch { /* ignore */ }
      bbSeriesRef.current = null;
    }
  }, [indicators.bb]);

  // ── RSI pane ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.rsi) {
      if (!rsiSeriesRef.current) {
        const s = chart.addSeries(LineSeries, {
          color: "#fb923c",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(0), minMove: 0.01 },
        }, RSI_PANE_INDEX);
        try {
          rsiOverboughtRef.current = s.createPriceLine({ price: 70, color: "rgba(239,68,68,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
          rsiOversoldRef.current = s.createPriceLine({ price: 30, color: "rgba(34,197,94,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
        } catch { /* ignore */ }
        rsiSeriesRef.current = s;
        if (candlesRef.current.length > 0) applyRsi(candlesRef.current, s);
      }
    } else if (rsiSeriesRef.current) {
      try { rsiSeriesRef.current.removePriceLine(rsiOverboughtRef.current!); } catch { /* ignore */ }
      try { rsiSeriesRef.current.removePriceLine(rsiOversoldRef.current!); } catch { /* ignore */ }
      try { chart.removeSeries(rsiSeriesRef.current); } catch { /* ignore */ }
      rsiSeriesRef.current = null;
      rsiOverboughtRef.current = null;
      rsiOversoldRef.current = null;
    }
  }, [indicators.rsi]);

  // ── MACD pane ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.macd) {
      if (!macdLineRef.current) {
        macdHistRef.current = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
          color: "rgba(34,197,94,0.6)",
          priceLineVisible: false,
          lastValueVisible: false,
        }, MACD_PANE_INDEX);
        macdLineRef.current = chart.addSeries(LineSeries, {
          color: "#60a5fa", lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, MACD_PANE_INDEX);
        macdSigRef.current = chart.addSeries(LineSeries, {
          color: "#f97316", lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, MACD_PANE_INDEX);
        if (candlesRef.current.length > 0) applyMacd(candlesRef.current);
      }
    } else if (macdLineRef.current) {
      try { chart.removeSeries(macdLineRef.current); } catch { /* ignore */ }
      try { if (macdSigRef.current) chart.removeSeries(macdSigRef.current); } catch { /* ignore */ }
      try { if (macdHistRef.current) chart.removeSeries(macdHistRef.current); } catch { /* ignore */ }
      macdLineRef.current = null;
      macdSigRef.current = null;
      macdHistRef.current = null;
    }
  }, [indicators.macd]);

  // ── Seed from REST whenever symbol/interval changes ──
  useEffect(() => {
    let cancelled = false;
    setSeedLoaded(false);
    lastTimeRef.current = 0;
    candlesRef.current = [];
    if (mainSeriesRef.current) { try { mainSeriesRef.current.setData([]); } catch { /* ignore */ } }
    if (volumeSeriesRef.current) { try { volumeSeriesRef.current.setData([]); } catch { /* ignore */ } }
    for (const id of Object.keys(maSeriesRef.current)) {
      try { maSeriesRef.current[id].setData([]); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const data = await get<any>(`/exchange/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`);
        const raw = Array.isArray(data) ? data : Array.isArray(data?.candles) ? data.candles : [];
        const candles: Candle[] = raw
          .map((c: any) => {
            if (Array.isArray(c)) {
              return { time: Math.floor(Number(c[0]) / 1000), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) };
            }
            return {
              time: Math.floor(Number(c.time ?? c.ts ?? c.timestamp ?? 0) / 1000),
              open: Number(c.open ?? c.o),
              high: Number(c.high ?? c.h),
              low: Number(c.low ?? c.l),
              close: Number(c.close ?? c.c),
              volume: Number(c.volume ?? c.v ?? 0),
            };
          })
          .filter((c: Candle) => c.time > 0 && c.close > 0)
          .sort((a: Candle, b: Candle) => a.time - b.time);
        const seen = new Set<number>();
        const unique = candles.filter((c) => {
          if (seen.has(c.time)) return false;
          seen.add(c.time);
          return true;
        });
        if (cancelled) return;
        candlesRef.current = unique;
        if (mainSeriesRef.current) applyCandlesToMain(unique, kind, mainSeriesRef.current);
        if (volumeSeriesRef.current) applyVolume(unique, volumeSeriesRef.current);
        for (const def of MA_DEFS) {
          const s = maSeriesRef.current[def.id];
          if (s) s.setData(sma(unique.map((c) => ({ time: c.time, close: c.close })), def.period));
        }
        if (bbSeriesRef.current) applyBollinger(unique, bbSeriesRef.current);
        if (rsiSeriesRef.current) applyRsi(unique, rsiSeriesRef.current);
        if (macdLineRef.current) applyMacd(unique);
        if (mainSeriesRef.current && unique.length > 0) {
          const last = unique[unique.length - 1];
          ensurePriceLine(mainSeriesRef.current, last.close, last.close >= last.open);
        }
        lastTimeRef.current = unique.length > 0 ? unique[unique.length - 1].time : 0;
        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        console.warn("chart seed failed", err);
      } finally {
        if (!cancelled) setSeedLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live OHLCV updates ──
  useEffect(() => {
    if (!seedLoaded || !mainSeriesRef.current || !liveCandles || liveCandles.length === 0) return;
    const sorted = [...liveCandles].sort((a, b) => a.time - b.time);
    for (const c of sorted) {
      if (!(c.time > 0)) continue;
      if (c.time < lastTimeRef.current) continue;
      try {
        // Update main series in correct shape per kind
        applyOneCandleToMain(c, kind, mainSeriesRef.current!);
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
          });
        }
        // Update candles ref
        const last = candlesRef.current[candlesRef.current.length - 1];
        if (last && last.time === c.time) {
          candlesRef.current[candlesRef.current.length - 1] = c;
        } else if (!last || c.time > last.time) {
          candlesRef.current.push(c);
          if (candlesRef.current.length > 1000) candlesRef.current = candlesRef.current.slice(-800);
        }
        // Recompute MA tails (cheap for last value only)
        for (const def of MA_DEFS) {
          const s = maSeriesRef.current[def.id];
          if (!s) continue;
          if (candlesRef.current.length >= def.period) {
            const tail = candlesRef.current.slice(-def.period);
            const avg = tail.reduce((sum, x) => sum + x.close, 0) / def.period;
            s.update({ time: c.time as Time, value: avg });
          }
        }
        // Recompute Bollinger / RSI / MACD on the streaming bar
        if (bbSeriesRef.current) applyBollinger(candlesRef.current, bbSeriesRef.current);
        if (rsiSeriesRef.current) applyRsi(candlesRef.current, rsiSeriesRef.current);
        if (macdLineRef.current) applyMacd(candlesRef.current);
        // Update live price line
        if (mainSeriesRef.current) {
          ensurePriceLine(mainSeriesRef.current, c.close, c.close >= c.open);
        }
        lastTimeRef.current = c.time;
      } catch (err) {
        console.warn("chart update skipped", err);
      }
    }
  }, [liveCandles, seedLoaded, kind]);

  // ── Helpers attached to outer scope (hoisted) ──
  function ensurePriceLine(series: ISeriesApi<SeriesType>, price: number, positive: boolean) {
    const color = positive ? "#22c55e" : "#ef4444";
    if (priceLineRef.current) {
      try {
        priceLineRef.current.applyOptions({ price, color, lineColor: color, axisLabelColor: color } as any);
      } catch { /* ignore */ }
    } else {
      try {
        priceLineRef.current = series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
      } catch { /* ignore */ }
    }
  }

  function applyCandlesToMain(candles: Candle[], k: ChartKind, series: ISeriesApi<SeriesType>) {
    if (k === "line" || k === "area") {
      series.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })) as any);
    } else {
      series.setData(candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })) as any);
    }
  }
  function applyOneCandleToMain(c: Candle, k: ChartKind, series: ISeriesApi<SeriesType>) {
    if (k === "line" || k === "area") {
      series.update({ time: c.time as Time, value: c.close } as any);
    } else {
      series.update({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close } as any);
    }
  }
  function applyVolume(candles: Candle[], v: ISeriesApi<"Histogram">) {
    v.setData(candles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
    })));
  }
  function applyBollinger(
    candles: Candle[],
    series: { upper: ISeriesApi<"Line">; middle: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> },
  ) {
    const bb = bollinger(candles.map((c) => ({ time: c.time, close: c.close })), 20, 2);
    series.upper.setData(bb.map((p) => ({ time: p.time as Time, value: p.upper })));
    series.middle.setData(bb.map((p) => ({ time: p.time as Time, value: p.middle })));
    series.lower.setData(bb.map((p) => ({ time: p.time as Time, value: p.lower })));
  }
  function applyRsi(candles: Candle[], series: ISeriesApi<"Line">) {
    const out = rsi(candles.map((c) => ({ time: c.time, close: c.close })), 14);
    series.setData(out.map((p) => ({ time: p.time as Time, value: p.value })));
  }
  function applyMacd(candles: Candle[]) {
    const out = macd(candles.map((c) => ({ time: c.time, close: c.close })), 12, 26, 9);
    if (macdLineRef.current) macdLineRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.macd })));
    if (macdSigRef.current) macdSigRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.signal })));
    if (macdHistRef.current) {
      macdHistRef.current.setData(out.map((p) => ({
        time: p.time as Time,
        value: p.hist,
        color: p.hist >= 0 ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)",
      })));
    }
  }

  // ── Toolbar handlers ──
  const handleReset = () => { chartRef.current?.timeScale().fitContent(); };
  const handleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn("fullscreen failed", err);
    }
  };
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const handleScreenshot = async () => {
    try {
      const chart = chartRef.current;
      if (!chart) return;
      const canvas = chart.takeScreenshot();
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${symbol.replace("/", "_")}_${interval}_${Date.now()}.png`;
      a.click();
      toast.success("Chart saved");
    } catch (err) {
      console.warn(err);
      toast.error("Could not save chart");
    }
  };

  const enabledMaCount = (indicators.ma7 ? 1 : 0) + (indicators.ma25 ? 1 : 0) + (indicators.ma99 ? 1 : 0);
  const indicatorBadge = enabledMaCount
    + (indicators.volume ? 1 : 0)
    + (indicators.bb ? 1 : 0)
    + (indicators.rsi ? 1 : 0)
    + (indicators.macd ? 1 : 0);

  // Display values for OHLC bar
  const display = hover?.candle || candlesRef.current[candlesRef.current.length - 1];
  const displayPct = hover?.pct ?? (display && display.open > 0 ? ((display.close - display.open) / display.open) * 100 : 0);

  return (
    <div ref={wrapperRef} className="flex flex-col h-full w-full bg-background relative">
      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/40 overflow-x-auto">
        {/* Quick intervals */}
        <div className="flex items-center gap-0.5 mr-1">
          {QUICK_INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`px-2 py-1 text-[11px] rounded font-mono transition-colors ${
                interval === iv ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {iv}
            </button>
          ))}
        </div>

        {/* More intervals dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`px-2 py-1 text-[11px] rounded font-mono transition-colors inline-flex items-center gap-1 ${
                !QUICK_INTERVALS.includes(interval as any)
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {!QUICK_INTERVALS.includes(interval as any) ? interval : "More"}
              <span className="text-[8px]">▼</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-2 space-y-2">
            {INTERVAL_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-1">{g.label}</div>
                <div className="grid grid-cols-3 gap-1">
                  {g.items.map((iv) => (
                    <button
                      key={iv}
                      onClick={() => setInterval(iv)}
                      className={`px-2 py-1 text-[11px] rounded font-mono transition-colors ${
                        interval === iv ? "bg-primary text-primary-foreground font-bold" : "bg-muted/30 hover:bg-muted/60 text-foreground"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Chart kind */}
        <div className="flex items-center gap-0.5">
          {CHART_KINDS.map((c) => {
            const Icon = c.icon;
            const active = kind === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setKind(c.id)}
                title={c.label}
                className={`p-1.5 rounded transition-colors ${
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Quick indicator pills — VOL / RSI / MACD always visible */}
        <div className="flex items-center gap-0.5">
          {(["volume", "rsi", "macd"] as const).map((key) => {
            const labels: Record<string, string> = { volume: "VOL", rsi: "RSI", macd: "MACD" };
            const colors: Record<string, string> = { volume: "#22c55e", rsi: "#fb923c", macd: "#60a5fa" };
            const on = indicators[key];
            return (
              <button
                key={key}
                onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key] }))}
                className={`px-2 py-0.5 text-[10px] rounded font-mono font-bold border transition-colors ${
                  on
                    ? "border-transparent text-black"
                    : "border-border text-muted-foreground hover:border-muted-foreground/50"
                }`}
                style={on ? { backgroundColor: colors[key] } : {}}
              >
                {labels[key]}
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        {/* More indicators (MA, BB) in dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="px-2 py-1 text-[11px] rounded inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40">
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Indicators</span>
              {(indicators.ma7 || indicators.ma25 || indicators.ma99 || indicators.bb) && (
                <span className="text-[9px] px-1 rounded bg-primary/15 text-primary font-bold min-w-[1rem] text-center">
                  {(indicators.ma7 ? 1 : 0) + (indicators.ma25 ? 1 : 0) + (indicators.ma99 ? 1 : 0) + (indicators.bb ? 1 : 0)}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-1">Moving Averages</div>
            {MA_DEFS.map((def) => {
              const enabled = indicators[def.id];
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setIndicators((p) => ({ ...p, [def.id]: !p[def.id] }))}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-sm"
                >
                  <span className="h-0.5 w-5 rounded" style={{ backgroundColor: def.color }} />
                  <span className="flex-1 text-left">{def.label}</span>
                  {enabled && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
            <div className="h-px bg-border my-1.5" />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-1">Bands</div>
            <button
              type="button"
              onClick={() => setIndicators((p) => ({ ...p, bb: !p.bb }))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-sm"
            >
              <span className="h-0.5 w-5 rounded" style={{ backgroundColor: BB_COLORS.upper }} />
              <span className="flex-1 text-left">Bollinger 20/2</span>
              {indicators.bb && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={handleReset} title="Reset zoom" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleScreenshot} title="Save chart" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40">
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── OHLC info bar (overlay on chart) ── */}
      {display && (
        <div className="absolute left-2 right-2 sm:left-3 sm:right-auto top-12 z-10 bg-card/85 backdrop-blur border border-border rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-[11px] font-mono pointer-events-none shadow-lg">
          {/* Mobile: compact single line — no unit suffix to save space */}
          <div className="flex items-center gap-x-2 sm:hidden">
            <span className="font-bold text-foreground">{base}/{quote}</span>
            <span className="text-muted-foreground">O <span className="text-foreground">{fmtPrice(display.open, quote === "INR" ? "INR" : "")}</span></span>
            <span className="text-muted-foreground">H <span className="text-success">{fmtPrice(display.high, quote === "INR" ? "INR" : "")}</span></span>
            <span className="text-muted-foreground">L <span className="text-destructive">{fmtPrice(display.low, quote === "INR" ? "INR" : "")}</span></span>
            <span className="text-muted-foreground">C <span className={displayPct >= 0 ? "text-success" : "text-destructive"}>{fmtPrice(display.close, quote === "INR" ? "INR" : "")}</span></span>
            <span className={`font-bold ${displayPct >= 0 ? "text-success" : "text-destructive"}`}>{displayPct >= 0 ? "+" : ""}{displayPct.toFixed(2)}%</span>
          </div>
          {/* Desktop: full OHLCV with unit suffix */}
          <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-bold text-foreground">{base}/{quote}</span>
            <span className="text-muted-foreground">O <span className="text-foreground">{fmtPrice(display.open, quote)}</span></span>
            <span className="text-muted-foreground">H <span className="text-success">{fmtPrice(display.high, quote)}</span></span>
            <span className="text-muted-foreground">L <span className="text-destructive">{fmtPrice(display.low, quote)}</span></span>
            <span className="text-muted-foreground">C <span className={displayPct >= 0 ? "text-success" : "text-destructive"}>{fmtPrice(display.close, quote)}</span></span>
            <span className={`font-bold ${displayPct >= 0 ? "text-success" : "text-destructive"}`}>{displayPct >= 0 ? "+" : ""}{displayPct.toFixed(2)}%</span>
            {display.volume > 0 && (
              <span className="text-muted-foreground">V <span className="text-foreground">{fmtCompact(display.volume)}</span></span>
            )}
            {MA_DEFS.filter((d) => indicators[d.id]).map((d) => {
              const tail = candlesRef.current.slice(-d.period);
              if (tail.length < d.period) return null;
              const avg = tail.reduce((s, x) => s + x.close, 0) / d.period;
              return (
                <span key={d.id} className="hidden md:inline-flex items-center gap-1 text-muted-foreground">
                  <span className="h-0.5 w-3 rounded" style={{ backgroundColor: d.color }} />
                  <span className="text-foreground">{fmtPrice(avg, quote)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart canvas + pane labels */}
      <div className="flex-1 min-h-[280px] relative">
        <div ref={containerRef} className="absolute inset-0" />
        {/* RSI pane label */}
        {indicators.rsi && (
          <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5" style={{ bottom: indicators.macd ? "33%" : "2%" }}>
            <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
              RSI 14
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">70 overbought · 30 oversold</span>
          </div>
        )}
        {/* MACD pane label */}
        {indicators.macd && (
          <div className="absolute left-2 bottom-[1%] pointer-events-none z-10 flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>
              MACD 12/26/9
            </span>
            <span className="text-[9px] font-mono" style={{ color: "#60a5fa" }}>MACD</span>
            <span className="text-[9px] font-mono" style={{ color: "#f97316" }}>Signal</span>
            <span className="text-[9px] font-mono text-muted-foreground">Hist</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {seedLoaded && candlesRef.current.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-8">
          <div className="text-center text-muted-foreground text-sm">
            <CandlestickChart className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <div>No chart data for this market yet.</div>
            <div className="text-xs mt-1">Live updates will appear when trades start flowing.</div>
          </div>
        </div>
      )}
    </div>
  );
}
