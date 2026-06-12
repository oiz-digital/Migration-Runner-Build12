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
  TrendingUp,
} from "lucide-react";
import { get } from "@/lib/api";
import { useOhlcv, type Candle } from "@/lib/marketSocket";
import { rsi, macd, bollinger, ema as calcEma, vwap as calcVwap, stochastic } from "@/lib/indicators";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

// ── Intervals ─────────────────────────────────────────────────────
const INTERVAL_GROUPS: { label: string; items: string[] }[] = [
  { label: "Minutes", items: ["1m", "3m", "5m", "15m", "30m"] },
  { label: "Hours",   items: ["1h", "2h", "4h", "6h", "12h"] },
  { label: "Days",    items: ["1d", "3d", "1w"] },
];
const QUICK_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Interval = string;

// ── Chart types ───────────────────────────────────────────────────
type ChartKind = "candles" | "heikinashi" | "line" | "area" | "bars";
const CHART_KINDS: { id: ChartKind; label: string; icon?: typeof CandlestickChart; text?: string }[] = [
  { id: "candles",    label: "Candles",      icon: CandlestickChart },
  { id: "heikinashi", label: "Heikin Ashi",  text: "HA" },
  { id: "line",       label: "Line",         icon: LineIcon },
  { id: "area",       label: "Area",         icon: AreaChart },
  { id: "bars",       label: "Bars",         icon: BarChart3 },
];

// ── Moving average defs ────────────────────────────────────────────
const SMA_DEFS = [
  { id: "ma7"  as const, period: 7,   color: "#facc15", label: "SMA 7"   },
  { id: "ma25" as const, period: 25,  color: "#60a5fa", label: "SMA 25"  },
  { id: "ma99" as const, period: 99,  color: "#f472b6", label: "SMA 99"  },
];
const EMA_DEFS = [
  { id: "ema9"   as const, period: 9,   color: "#c084fc", label: "EMA 9"   },
  { id: "ema21"  as const, period: 21,  color: "#22d3ee", label: "EMA 21"  },
  { id: "ema50"  as const, period: 50,  color: "#fb923c", label: "EMA 50"  },
  { id: "ema200" as const, period: 200, color: "#f87171", label: "EMA 200" },
];
// Legacy alias so existing code using MA_DEFS still works for the legend
const MA_DEFS = [...SMA_DEFS, ...EMA_DEFS];

// ── Indicator state ───────────────────────────────────────────────
type IndicatorState = {
  ma7: boolean; ma25: boolean; ma99: boolean;
  ema9: boolean; ema21: boolean; ema50: boolean; ema200: boolean;
  volume: boolean; vwap: boolean;
  bb: boolean; rsi: boolean; macd: boolean; stoch: boolean;
};
const DEFAULT_INDICATORS: IndicatorState = {
  ma7: true, ma25: true, ma99: false,
  ema9: false, ema21: true, ema50: false, ema200: false,
  volume: true, vwap: false,
  bb: false, rsi: true, macd: true, stoch: false,
};

// ── Pane indices ──────────────────────────────────────────────────
const RSI_PANE   = 1;
const MACD_PANE  = 2;
const STOCH_PANE = 3;

// ── Colours ───────────────────────────────────────────────────────
const BB_COLORS = { upper: "#a78bfa", middle: "#a78bfa", lower: "#a78bfa" };

// ── Persistence keys ─────────────────────────────────────────────
const INDICATOR_KEY = "zebvix:chart:indicators";
const KIND_KEY      = "zebvix:chart:kind";

// ── Helpers ───────────────────────────────────────────────────────
function sma(values: { time: number; close: number }[], period: number): LineData[] {
  if (values.length < period) return [];
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i].close;
    if (i >= period) sum -= values[i - period].close;
    if (i >= period - 1) out.push({ time: values[i].time as Time, value: sum / period });
  }
  return out;
}

/** Compute Heikin Ashi bars from raw OHLCV data. */
function computeHA(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const ha: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen  = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    ha.push({
      time:   c.time,
      open:   haOpen,
      high:   Math.max(c.high, haOpen, haClose),
      low:    Math.min(c.low,  haOpen, haClose),
      close:  haClose,
      volume: c.volume,
    });
  }
  return ha;
}

function fmtPrice(n: number, quote: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr    = quote === "INR";
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  const prefix = inr ? "₹" : "";
  const suffix = !inr && quote ? ` ${quote}` : "";
  return prefix + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}
function fmtCompact(n: number, prefix = ""): string {
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════
export function PriceChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  // ── Series refs ────────────────────────────────────────────────
  const mainSeriesRef   = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef    = useRef<Record<string, ISeriesApi<"Line">>>({});
  const emaSeriesRef    = useRef<Record<string, ISeriesApi<"Line">>>({});
  const bbSeriesRef     = useRef<{ upper: ISeriesApi<"Line">; middle: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> } | null>(null);
  const vwapSeriesRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObRef        = useRef<IPriceLine | null>(null);
  const rsiOsRef        = useRef<IPriceLine | null>(null);
  const macdHistRef     = useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdLineRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSigRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const stochObRef      = useRef<IPriceLine | null>(null);
  const stochOsRef      = useRef<IPriceLine | null>(null);
  const priceLineRef    = useRef<IPriceLine | null>(null);
  const lastTimeRef     = useRef<number>(0);
  const candlesRef      = useRef<Candle[]>([]);

  // ── State ──────────────────────────────────────────────────────
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
  const base  = useMemo(() => symbol.split("/")[0] || symbol,  [symbol]);

  // Persist UI state
  useEffect(() => { try { window.localStorage.setItem(KIND_KEY, kind); } catch { /* */ } }, [kind]);
  useEffect(() => { try { window.localStorage.setItem(INDICATOR_KEY, JSON.stringify(indicators)); } catch { /* */ } }, [indicators]);

  // ── Init chart ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background:  { color: "transparent" },
        textColor:   "#94a3b8",
        fontFamily:  "JetBrains Mono, Menlo, monospace",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.07)" },
        horzLines: { color: "rgba(148,163,184,0.07)" },
      },
      rightPriceScale: {
        borderColor:  "rgba(148,163,184,0.12)",
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor:    "rgba(148,163,184,0.12)",
        timeVisible:    true,
        secondsVisible: false,
        rightOffset:    8,
        barSpacing:     8,
      },
      crosshair: {
        mode:     1,
        vertLine: { color: "rgba(250,204,21,0.5)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ca8a04" },
        horzLine: { color: "rgba(250,204,21,0.5)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ca8a04" },
      },
      autoSize: true,
    });
    chartRef.current = chart;
    return () => {
      try { chart.remove(); } catch { /* */ }
      chartRef.current   = null;
      mainSeriesRef.current  = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current   = {};
      emaSeriesRef.current   = {};
      bbSeriesRef.current    = null;
      vwapSeriesRef.current  = null;
      rsiSeriesRef.current   = null;
      rsiObRef.current       = null;
      rsiOsRef.current       = null;
      macdHistRef.current    = null;
      macdLineRef.current    = null;
      macdSigRef.current     = null;
      stochKRef.current      = null;
      stochDRef.current      = null;
      stochObRef.current     = null;
      stochOsRef.current     = null;
      priceLineRef.current   = null;
    };
  }, []);

  // ── Crosshair hover ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: MouseEventParams) => {
      if (!param.time || !param.point) { setHover(null); return; }
      const t = Number(param.time);
      const c = candlesRef.current.find((x) => x.time === t);
      if (!c) { setHover(null); return; }
      const pct = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
      setHover({ candle: c, pct });
    };
    chart.subscribeCrosshairMove(handler);
    return () => { try { chart.unsubscribeCrosshairMove(handler); } catch { /* */ } };
  }, []);

  // ── Recreate main series on kind change ──────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      try { chart.removeSeries(mainSeriesRef.current); } catch { /* */ }
      mainSeriesRef.current = null;
      priceLineRef.current  = null;
    }
    let s: ISeriesApi<SeriesType>;
    switch (kind) {
      case "line":
        s = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2 });
        break;
      case "area":
        s = chart.addSeries(AreaSeries, {
          lineColor:   "#f59e0b",
          topColor:    "rgba(245,158,11,0.30)",
          bottomColor: "rgba(245,158,11,0.00)",
          lineWidth:   2,
        });
        break;
      case "bars":
        s = chart.addSeries(BarSeries, { upColor: "#22c55e", downColor: "#ef4444", openVisible: true, thinBars: false });
        break;
      case "heikinashi":
      case "candles":
      default:
        s = chart.addSeries(CandlestickSeries, {
          upColor:      "#22c55e",
          downColor:    "#ef4444",
          wickUpColor:  "#22c55e",
          wickDownColor:"#ef4444",
          borderVisible: false,
        });
        break;
    }
    mainSeriesRef.current = s;
    if (candlesRef.current.length > 0) {
      const displayCandles = kind === "heikinashi" ? computeHA(candlesRef.current) : candlesRef.current;
      applyCandlesToMain(displayCandles, kind, s);
      const last = displayCandles[displayCandles.length - 1];
      ensurePriceLine(s, last.close, last.close >= last.open);
    }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume ────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.volume) {
      if (!volumeSeriesRef.current) {
        const v = chart.addSeries(HistogramSeries, {
          priceFormat:  { type: "volume" },
          priceScaleId: "volume",
          color:        "rgba(34,197,94,0.45)",
        });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
        volumeSeriesRef.current = v;
        if (candlesRef.current.length > 0) applyVolume(candlesRef.current, v);
      }
    } else if (volumeSeriesRef.current) {
      try { chart.removeSeries(volumeSeriesRef.current); } catch { /* */ }
      volumeSeriesRef.current = null;
    }
  }, [indicators.volume]);

  // ── SMA overlays ──────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const def of SMA_DEFS) {
      const enabled  = indicators[def.id];
      const existing = smaSeriesRef.current[def.id];
      if (enabled && !existing) {
        const s = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        smaSeriesRef.current[def.id] = s;
        if (candlesRef.current.length > 0)
          s.setData(sma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), def.period));
      } else if (!enabled && existing) {
        try { chart.removeSeries(existing); } catch { /* */ }
        delete smaSeriesRef.current[def.id];
      }
    }
  }, [indicators.ma7, indicators.ma25, indicators.ma99]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── EMA overlays ──────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const def of EMA_DEFS) {
      const enabled  = indicators[def.id];
      const existing = emaSeriesRef.current[def.id];
      if (enabled && !existing) {
        const s = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        emaSeriesRef.current[def.id] = s;
        if (candlesRef.current.length > 0) {
          const pts = calcEma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), def.period);
          s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
        }
      } else if (!enabled && existing) {
        try { chart.removeSeries(existing); } catch { /* */ }
        delete emaSeriesRef.current[def.id];
      }
    }
  }, [indicators.ema9, indicators.ema21, indicators.ema50, indicators.ema200]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bollinger Bands ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.bb) {
      if (!bbSeriesRef.current) {
        const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        const upper  = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.upper });
        const middle = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.middle, lineStyle: LineStyle.Dashed });
        const lower  = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.lower });
        bbSeriesRef.current = { upper, middle, lower };
        if (candlesRef.current.length > 0) applyBollinger(candlesRef.current, bbSeriesRef.current);
      }
    } else if (bbSeriesRef.current) {
      try { chart.removeSeries(bbSeriesRef.current.upper);  } catch { /* */ }
      try { chart.removeSeries(bbSeriesRef.current.middle); } catch { /* */ }
      try { chart.removeSeries(bbSeriesRef.current.lower);  } catch { /* */ }
      bbSeriesRef.current = null;
    }
  }, [indicators.bb]);

  // ── VWAP overlay ─────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.vwap) {
      if (!vwapSeriesRef.current) {
        const s = chart.addSeries(LineSeries, {
          color: "#e879f9", lineWidth: 2, lineStyle: LineStyle.Dashed,
          priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        });
        vwapSeriesRef.current = s;
        if (candlesRef.current.length > 0) applyVwap(candlesRef.current, s);
      }
    } else if (vwapSeriesRef.current) {
      try { chart.removeSeries(vwapSeriesRef.current); } catch { /* */ }
      vwapSeriesRef.current = null;
    }
  }, [indicators.vwap]);

  // ── RSI pane ─────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.rsi) {
      if (!rsiSeriesRef.current) {
        const s = chart.addSeries(LineSeries, {
          color: "#fb923c", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
          priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(0), minMove: 0.01 },
        }, RSI_PANE);
        try {
          rsiObRef.current = s.createPriceLine({ price: 70, color: "rgba(239,68,68,0.5)",  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
          rsiOsRef.current = s.createPriceLine({ price: 30, color: "rgba(34,197,94,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
        } catch { /* */ }
        rsiSeriesRef.current = s;
        if (candlesRef.current.length > 0) applyRsi(candlesRef.current, s);
      }
    } else if (rsiSeriesRef.current) {
      try { rsiSeriesRef.current.removePriceLine(rsiObRef.current!); } catch { /* */ }
      try { rsiSeriesRef.current.removePriceLine(rsiOsRef.current!); } catch { /* */ }
      try { chart.removeSeries(rsiSeriesRef.current); } catch { /* */ }
      rsiSeriesRef.current = null; rsiObRef.current = null; rsiOsRef.current = null;
    }
  }, [indicators.rsi]);

  // ── MACD pane ────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.macd) {
      if (!macdLineRef.current) {
        macdHistRef.current = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
          color: "rgba(34,197,94,0.55)", priceLineVisible: false, lastValueVisible: false,
        }, MACD_PANE);
        macdLineRef.current = chart.addSeries(LineSeries, {
          color: "#60a5fa", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, MACD_PANE);
        macdSigRef.current = chart.addSeries(LineSeries, {
          color: "#f97316", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, MACD_PANE);
        if (candlesRef.current.length > 0) applyMacd(candlesRef.current);
      }
    } else if (macdLineRef.current) {
      try { chart.removeSeries(macdLineRef.current); } catch { /* */ }
      try { if (macdSigRef.current)  chart.removeSeries(macdSigRef.current);  } catch { /* */ }
      try { if (macdHistRef.current) chart.removeSeries(macdHistRef.current); } catch { /* */ }
      macdLineRef.current = null; macdSigRef.current = null; macdHistRef.current = null;
    }
  }, [indicators.macd]);

  // ── Stochastic pane ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.stoch) {
      if (!stochKRef.current) {
        const priceFormat = { type: "custom" as const, formatter: (v: number) => v.toFixed(0), minMove: 0.01 };
        stochKRef.current = chart.addSeries(LineSeries, {
          color: "#4ade80", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceFormat,
        }, STOCH_PANE);
        stochDRef.current = chart.addSeries(LineSeries, {
          color: "#f97316", lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceFormat,
        }, STOCH_PANE);
        try {
          stochObRef.current = stochKRef.current.createPriceLine({ price: 80, color: "rgba(239,68,68,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "80" });
          stochOsRef.current = stochKRef.current.createPriceLine({ price: 20, color: "rgba(34,197,94,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "20" });
        } catch { /* */ }
        if (candlesRef.current.length > 0) applyStoch(candlesRef.current);
      }
    } else if (stochKRef.current) {
      try { stochKRef.current.removePriceLine(stochObRef.current!); } catch { /* */ }
      try { stochKRef.current.removePriceLine(stochOsRef.current!); } catch { /* */ }
      try { chart.removeSeries(stochKRef.current); } catch { /* */ }
      try { if (stochDRef.current) chart.removeSeries(stochDRef.current); } catch { /* */ }
      stochKRef.current = null; stochDRef.current = null; stochObRef.current = null; stochOsRef.current = null;
    }
  }, [indicators.stoch]);

  // ── Seed from REST on symbol / interval change ────────────────
  useEffect(() => {
    let cancelled = false;
    setSeedLoaded(false);
    lastTimeRef.current = 0;
    candlesRef.current  = [];
    const clearSeries = (s: ISeriesApi<SeriesType>) => { try { s.setData([]); } catch { /* */ } };
    if (mainSeriesRef.current)  clearSeries(mainSeriesRef.current);
    if (volumeSeriesRef.current) clearSeries(volumeSeriesRef.current);
    Object.values(smaSeriesRef.current).forEach(clearSeries);
    Object.values(emaSeriesRef.current).forEach(clearSeries);

    (async () => {
      try {
        const data = await get<any>(`/exchange/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=500`);
        const raw  = Array.isArray(data) ? data : Array.isArray(data?.candles) ? data.candles : [];
        const candles: Candle[] = raw
          .map((c: any) => {
            if (Array.isArray(c)) {
              return { time: Math.floor(Number(c[0]) / 1000), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) };
            }
            return {
              time:   Math.floor(Number(c.time ?? c.ts ?? c.timestamp ?? 0) / 1000),
              open:   Number(c.open  ?? c.o),
              high:   Number(c.high  ?? c.h),
              low:    Number(c.low   ?? c.l),
              close:  Number(c.close ?? c.c),
              volume: Number(c.volume ?? c.v ?? 0),
            };
          })
          .filter((c: Candle) => c.time > 0 && c.close > 0)
          .sort((a: Candle, b: Candle) => a.time - b.time);
        const seen = new Set<number>();
        const unique = candles.filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
        if (cancelled) return;
        candlesRef.current = unique;

        // Main series
        if (mainSeriesRef.current) {
          const displayCandles = kind === "heikinashi" ? computeHA(unique) : unique;
          applyCandlesToMain(displayCandles, kind, mainSeriesRef.current);
          if (displayCandles.length > 0) {
            const last = displayCandles[displayCandles.length - 1];
            ensurePriceLine(mainSeriesRef.current, last.close, last.close >= last.open);
          }
        }
        // Volume
        if (volumeSeriesRef.current) applyVolume(unique, volumeSeriesRef.current);
        // SMA
        for (const def of SMA_DEFS) {
          const s = smaSeriesRef.current[def.id];
          if (s) s.setData(sma(unique.map((c) => ({ time: c.time, close: c.close })), def.period));
        }
        // EMA
        for (const def of EMA_DEFS) {
          const s = emaSeriesRef.current[def.id];
          if (s) {
            const pts = calcEma(unique.map((c) => ({ time: c.time, close: c.close })), def.period);
            s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
          }
        }
        // Others
        if (bbSeriesRef.current)   applyBollinger(unique, bbSeriesRef.current);
        if (vwapSeriesRef.current) applyVwap(unique, vwapSeriesRef.current);
        if (rsiSeriesRef.current)  applyRsi(unique, rsiSeriesRef.current);
        if (macdLineRef.current)   applyMacd(unique);
        if (stochKRef.current)     applyStoch(unique);

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

  // ── Live OHLCV updates ────────────────────────────────────────
  useEffect(() => {
    if (!seedLoaded || !mainSeriesRef.current || !liveCandles || liveCandles.length === 0) return;
    const sorted = [...liveCandles].sort((a, b) => a.time - b.time);
    for (const c of sorted) {
      if (!(c.time > 0) || c.time < lastTimeRef.current) continue;
      try {
        // Update raw candles ref
        const last = candlesRef.current[candlesRef.current.length - 1];
        if (last && last.time === c.time) {
          candlesRef.current[candlesRef.current.length - 1] = c;
        } else if (!last || c.time > last.time) {
          candlesRef.current.push(c);
          if (candlesRef.current.length > 1000) candlesRef.current = candlesRef.current.slice(-800);
        }
        // Update main series
        if (kind === "heikinashi") {
          const ha = computeHA(candlesRef.current);
          const haLast = ha[ha.length - 1];
          if (haLast) mainSeriesRef.current!.update({ time: haLast.time as Time, open: haLast.open, high: haLast.high, low: haLast.low, close: haLast.close } as any);
          if (haLast) ensurePriceLine(mainSeriesRef.current!, haLast.close, haLast.close >= haLast.open);
        } else {
          applyOneCandleToMain(c, kind, mainSeriesRef.current!);
          ensurePriceLine(mainSeriesRef.current!, c.close, c.close >= c.open);
        }
        // Volume
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)" });
        }
        // SMA tail update
        for (const def of SMA_DEFS) {
          const s = smaSeriesRef.current[def.id];
          if (!s || candlesRef.current.length < def.period) continue;
          const tail = candlesRef.current.slice(-def.period);
          const avg  = tail.reduce((sum, x) => sum + x.close, 0) / def.period;
          s.update({ time: c.time as Time, value: avg });
        }
        // EMA tail update (simplified: recompute last point)
        for (const def of EMA_DEFS) {
          const s = emaSeriesRef.current[def.id];
          if (!s || candlesRef.current.length < def.period) continue;
          const pts = calcEma(candlesRef.current.map((x) => ({ time: x.time, close: x.close })), def.period);
          if (pts.length > 0) s.update({ time: pts[pts.length - 1].time as Time, value: pts[pts.length - 1].value });
        }
        // Full recompute for band/oscillator indicators
        if (bbSeriesRef.current)   applyBollinger(candlesRef.current, bbSeriesRef.current);
        if (vwapSeriesRef.current) applyVwap(candlesRef.current, vwapSeriesRef.current);
        if (rsiSeriesRef.current)  applyRsi(candlesRef.current, rsiSeriesRef.current);
        if (macdLineRef.current)   applyMacd(candlesRef.current);
        if (stochKRef.current)     applyStoch(candlesRef.current);
        lastTimeRef.current = c.time;
      } catch (err) {
        console.warn("chart update skipped", err);
      }
    }
  }, [liveCandles, seedLoaded, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers (hoisted) ─────────────────────────────────────────
  function ensurePriceLine(series: ISeriesApi<SeriesType>, price: number, positive: boolean) {
    const color = positive ? "#22c55e" : "#ef4444";
    if (priceLineRef.current) {
      try { priceLineRef.current.applyOptions({ price, color, lineColor: color, axisLabelColor: color } as any); } catch { /* */ }
    } else {
      try {
        priceLineRef.current = series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
      } catch { /* */ }
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
    v.setData(candles.map((c) => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)" })));
  }
  function applyBollinger(candles: Candle[], series: { upper: ISeriesApi<"Line">; middle: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> }) {
    const bb = bollinger(candles.map((c) => ({ time: c.time, close: c.close })), 20, 2);
    series.upper.setData(bb.map((p) => ({ time: p.time as Time, value: p.upper })));
    series.middle.setData(bb.map((p) => ({ time: p.time as Time, value: p.middle })));
    series.lower.setData(bb.map((p) => ({ time: p.time as Time, value: p.lower })));
  }
  function applyVwap(candles: Candle[], series: ISeriesApi<"Line">) {
    const pts = calcVwap(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })));
    series.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
  }
  function applyRsi(candles: Candle[], series: ISeriesApi<"Line">) {
    const out = rsi(candles.map((c) => ({ time: c.time, close: c.close })), 14);
    series.setData(out.map((p) => ({ time: p.time as Time, value: p.value })));
  }
  function applyMacd(candles: Candle[]) {
    const out = macd(candles.map((c) => ({ time: c.time, close: c.close })), 12, 26, 9);
    if (macdLineRef.current) macdLineRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.macd })));
    if (macdSigRef.current)  macdSigRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.signal })));
    if (macdHistRef.current) {
      macdHistRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.hist, color: p.hist >= 0 ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)" })));
    }
  }
  function applyStoch(candles: Candle[]) {
    const out = stochastic(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })), 14, 3);
    if (stochKRef.current) stochKRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.k })));
    if (stochDRef.current) stochDRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.d })));
  }

  // ── Toolbar handlers ─────────────────────────────────────────
  const handleReset      = () => { chartRef.current?.timeScale().fitContent(); };
  const handleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen(); setIsFullscreen(true); }
      else { await document.exitFullscreen(); setIsFullscreen(false); }
    } catch { /* */ }
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
      a.href = url; a.download = `${symbol.replace("/", "_")}_${interval}_${Date.now()}.png`; a.click();
      toast.success("Chart saved");
    } catch { toast.error("Could not save chart"); }
  };

  // ── Derived display values ────────────────────────────────────
  const display     = hover?.candle || candlesRef.current[candlesRef.current.length - 1];
  const displayPct  = hover?.pct ?? (display && display.open > 0 ? ((display.close - display.open) / display.open) * 100 : 0);
  const activeIndicatorCount =
    (indicators.ma7 ? 1 : 0) + (indicators.ma25 ? 1 : 0) + (indicators.ma99 ? 1 : 0) +
    (indicators.ema9 ? 1 : 0) + (indicators.ema21 ? 1 : 0) + (indicators.ema50 ? 1 : 0) + (indicators.ema200 ? 1 : 0) +
    (indicators.volume ? 1 : 0) + (indicators.vwap ? 1 : 0) +
    (indicators.bb ? 1 : 0) + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + (indicators.stoch ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="flex flex-col h-full w-full bg-background relative">
      {/* ── Top toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-border bg-card/40 overflow-x-auto shrink-0">

        {/* Quick intervals */}
        <div className="flex items-center gap-0.5 mr-0.5">
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

        {/* More intervals */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`px-2 py-1 text-[11px] rounded font-mono transition-colors inline-flex items-center gap-0.5 ${
              !QUICK_INTERVALS.includes(interval as any) ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/40"
            }`}>
              {!QUICK_INTERVALS.includes(interval as any) ? interval : "More"}<span className="text-[8px]">▼</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-2 space-y-2">
            {INTERVAL_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-1">{g.label}</div>
                <div className="grid grid-cols-3 gap-1">
                  {g.items.map((iv) => (
                    <button key={iv} onClick={() => setInterval(iv)} className={`px-2 py-1 text-[11px] rounded font-mono transition-colors ${
                      interval === iv ? "bg-primary text-primary-foreground font-bold" : "bg-muted/30 hover:bg-muted/60 text-foreground"
                    }`}>{iv}</button>
                  ))}
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        <div className="h-5 w-px bg-border mx-0.5 shrink-0" />

        {/* Chart types */}
        <div className="flex items-center gap-0.5">
          {CHART_KINDS.map((c) => {
            const Icon   = c.icon;
            const active = kind === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setKind(c.id)}
                title={c.label}
                className={`p-1.5 rounded transition-colors text-[10px] font-bold ${
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="font-mono">{c.text}</span>}
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border mx-0.5 shrink-0" />

        {/* Quick indicator pills */}
        <div className="flex items-center gap-0.5">
          {([
            { key: "volume" as const, label: "VOL",   color: "#22c55e" },
            { key: "rsi"    as const, label: "RSI",   color: "#fb923c" },
            { key: "macd"   as const, label: "MACD",  color: "#60a5fa" },
            { key: "stoch"  as const, label: "STOCH", color: "#4ade80" },
          ]).map(({ key, label, color }) => {
            const on = indicators[key];
            return (
              <button
                key={key}
                onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key] }))}
                className={`px-1.5 py-0.5 text-[10px] rounded font-mono font-bold border transition-all ${
                  on ? "border-transparent text-black scale-[1.02]" : "border-border text-muted-foreground hover:border-muted-foreground/50"
                }`}
                style={on ? { backgroundColor: color } : {}}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border mx-0.5 shrink-0" />

        {/* Indicators panel — MA/EMA/BB/VWAP */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="px-2 py-1 text-[11px] rounded inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Indicators</span>
              {activeIndicatorCount > 0 && (
                <span className="text-[9px] px-1 rounded bg-primary/15 text-primary font-bold min-w-[1.1rem] text-center">
                  {activeIndicatorCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2.5 space-y-3">
            {/* SMA */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Moving Averages (SMA)
              </div>
              <div className="grid grid-cols-3 gap-1">
                {SMA_DEFS.map((def) => {
                  const on = indicators[def.id];
                  return (
                    <button key={def.id} onClick={() => setIndicators((p) => ({ ...p, [def.id]: !p[def.id] }))}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all border ${on ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                      style={on ? { backgroundColor: def.color + "33", borderColor: def.color } : {}}>
                      <span className="h-0.5 w-3 rounded shrink-0" style={{ backgroundColor: def.color }} />
                      <span>{def.label.split(" ")[1]}</span>
                      {on && <Check className="h-2.5 w-2.5 ml-auto shrink-0" style={{ color: def.color }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* EMA */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">
                EMA
              </div>
              <div className="grid grid-cols-4 gap-1">
                {EMA_DEFS.map((def) => {
                  const on = indicators[def.id];
                  return (
                    <button key={def.id} onClick={() => setIndicators((p) => ({ ...p, [def.id]: !p[def.id] }))}
                      className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded text-[10px] transition-all border ${on ? "border-transparent" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                      style={on ? { backgroundColor: def.color + "22", borderColor: def.color, color: def.color } : {}}>
                      <span className="h-0.5 w-4 rounded" style={{ backgroundColor: def.color }} />
                      <span className="font-mono">{def.period}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="h-px bg-border" />
            {/* Bands */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">Bands</div>
              <button onClick={() => setIndicators((p) => ({ ...p, bb: !p.bb }))}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-sm transition-colors">
                <span className="h-0.5 w-5 rounded" style={{ backgroundColor: BB_COLORS.upper }} />
                <span className="flex-1 text-left text-xs">Bollinger 20/2</span>
                {indicators.bb && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            </div>
            <div className="h-px bg-border" />
            {/* Volume section */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">Volume</div>
              {([
                { key: "volume" as const, label: "Volume Bars",  color: "#22c55e" },
                { key: "vwap"   as const, label: "VWAP",         color: "#e879f9" },
              ]).map(({ key, label, color }) => (
                <button key={key} onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key] }))}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-xs transition-colors">
                  <span className="h-0.5 w-5 rounded" style={{ backgroundColor: color }} />
                  <span className="flex-1 text-left">{label}</span>
                  {indicators[key] && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Right-side utility buttons */}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button onClick={handleReset} title="Reset zoom" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleScreenshot} title="Save chart" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── OHLC info bar (overlay on chart) ──────────────────── */}
      {display && (
        <div className="absolute left-2 right-2 sm:left-3 sm:right-auto top-12 z-10 bg-card/85 backdrop-blur border border-border rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-[11px] font-mono pointer-events-none shadow-lg">
          {/* Mobile: compact single line */}
          <div className="flex items-center gap-x-2 sm:hidden">
            <span className="font-bold text-foreground">{base}/{quote}</span>
            {kind === "heikinashi" && <span className="text-[9px] text-amber-400 font-bold">HA</span>}
            <span className="text-muted-foreground">O <span className="text-foreground">{fmtPrice(display.open, quote === "INR" ? "INR" : "")}</span></span>
            <span className="text-muted-foreground">H <span className="text-success">{fmtPrice(display.high, quote === "INR" ? "INR" : "")}</span></span>
            <span className="text-muted-foreground">L <span className="text-destructive">{fmtPrice(display.low, quote === "INR" ? "INR" : "")}</span></span>
            <span className="text-muted-foreground">C <span className={displayPct >= 0 ? "text-success" : "text-destructive"}>{fmtPrice(display.close, quote === "INR" ? "INR" : "")}</span></span>
            <span className={`font-bold ${displayPct >= 0 ? "text-success" : "text-destructive"}`}>{displayPct >= 0 ? "+" : ""}{displayPct.toFixed(2)}%</span>
          </div>
          {/* Desktop: full OHLCV */}
          <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-bold text-foreground">{base}/{quote}</span>
            {kind === "heikinashi" && <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1 py-0.5 font-bold">HA</span>}
            <span className="text-muted-foreground">O <span className="text-foreground">{fmtPrice(display.open, quote)}</span></span>
            <span className="text-muted-foreground">H <span className="text-success">{fmtPrice(display.high, quote)}</span></span>
            <span className="text-muted-foreground">L <span className="text-destructive">{fmtPrice(display.low, quote)}</span></span>
            <span className="text-muted-foreground">C <span className={displayPct >= 0 ? "text-success" : "text-destructive"}>{fmtPrice(display.close, quote)}</span></span>
            <span className={`font-bold ${displayPct >= 0 ? "text-success" : "text-destructive"}`}>{displayPct >= 0 ? "+" : ""}{displayPct.toFixed(2)}%</span>
            {display.volume > 0 && (
              <span className="text-muted-foreground">V <span className="text-foreground">{fmtCompact(display.volume)}</span></span>
            )}
            {/* Active MA/EMA legend */}
            {MA_DEFS.filter((d) => indicators[d.id]).map((d) => {
              const allDefs = [...SMA_DEFS, ...EMA_DEFS];
              const defInfo = allDefs.find((x) => x.id === d.id);
              if (!defInfo) return null;
              const isEma = EMA_DEFS.some((e) => e.id === d.id);
              const seriesRef = isEma ? emaSeriesRef.current[d.id] : smaSeriesRef.current[d.id];
              if (!seriesRef || candlesRef.current.length === 0) return null;
              const pts = isEma
                ? calcEma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), defInfo.period)
                : sma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), defInfo.period);
              const lastVal = isEma
                ? (pts.length > 0 ? (pts as { value: number }[])[pts.length - 1].value : 0)
                : (pts.length > 0 ? (pts as LineData[])[pts.length - 1].value as number : 0);
              if (!lastVal) return null;
              return (
                <span key={d.id} className="hidden md:inline-flex items-center gap-1 text-muted-foreground">
                  <span className="h-0.5 w-3 rounded" style={{ backgroundColor: defInfo.color }} />
                  <span className="text-foreground" style={{ color: defInfo.color }}>{fmtPrice(lastVal, "")}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Chart canvas + pane labels ────────────────────────── */}
      <div className="flex-1 min-h-[280px] relative">
        <div ref={containerRef} className="absolute inset-0" />
        {/* RSI pane label */}
        {indicators.rsi && (
          <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5"
            style={{ bottom: indicators.macd && indicators.stoch ? "45%" : indicators.macd || indicators.stoch ? "33%" : "2%" }}>
            <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded"
              style={{ backgroundColor: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
              RSI 14
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">70 overbought · 30 oversold</span>
          </div>
        )}
        {/* MACD pane label */}
        {indicators.macd && (
          <div className="absolute left-2 pointer-events-none z-10 flex items-center gap-1.5"
            style={{ bottom: indicators.stoch ? "22%" : "1%" }}>
            <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded"
              style={{ backgroundColor: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}>
              MACD
            </span>
            <span className="text-[9px] font-mono text-muted-foreground hidden sm:inline">12/26/9  MACD Signal Hist</span>
          </div>
        )}
        {/* Stoch pane label */}
        {indicators.stoch && (
          <div className="absolute left-2 bottom-[1%] pointer-events-none z-10 flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded"
              style={{ backgroundColor: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
              STOCH
            </span>
            <span className="text-[9px] font-mono text-muted-foreground hidden sm:inline">14/3  %K %D  80/20</span>
          </div>
        )}
      </div>
    </div>
  );
}
