import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Flame,
  BarChart3,
  Wallet as WalletIcon,
  Zap,
  Shield,
  Lock,
  Banknote,
  Headphones,
  Sparkles,
  ChevronRight,
  Globe2,
  Activity,
  Boxes,
  Link2,
  Code2,
  ArrowLeftRight,
  Smartphone,
  CircleDollarSign,
  Cpu,
  Layers,
  Network,
  Copy,
  Check,
  X,
  Search,
  PiggyBank,
  Coins,
  Rocket,
  Gem,
  Terminal,
  BookOpen,
  Database,
  CalendarDays,
  CircleCheck,
  CircleDot,
  Circle,
  Megaphone,
  Eye,
  Bell,
  Wifi,
  BatteryFull,
  SignalHigh,
  Home as HomeIcon,
  User as UserIcon,
  Plus,
  Minus,
  Repeat,
  Star,
  Brain,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useTickers, encodeSymbol, type NormalizedTicker } from "@/lib/marketSocket";
import { useAuth } from "@/lib/auth";
import { KycProgressBanner } from "@/components/KycGate";
import { get } from "@/lib/api";
import { useMarketCatalog } from "@/lib/marketCatalog";
import { buildUsdRates } from "@/lib/volumeUsd";

// ──────────────────────────────────────────────────────────────────
// Constants — real Zebvix L1 chain identity
// ──────────────────────────────────────────────────────────────────
const ZBX_CHAIN = {
  name: "Zebvix L1",
  id: 8989,
  hexId: "0x231d",
  symbol: "ZBX",
  tokenStandard: "ZBX-20",
};
const ZBX_TESTNET = { name: "Zebvix Testnet", id: 8990, hexId: "0x231e" };

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function isInr(sym: string) {
  return sym.endsWith("/INR") || sym.endsWith("INR");
}
function currencyPrefix(sym: string): string {
  if (isInr(sym)) return "₹";
  return "";
}
function fmtPrice(n: number, sym: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr = isInr(sym);
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  return currencyPrefix(sym) + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtCompact(n: number, prefix = "") {
  if (!isFinite(n) || n === 0) return prefix + "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}
function baseAsset(sym: string) {
  return sym.split("/")[0] || sym;
}
function quoteAsset(sym: string) {
  return sym.split("/")[1] || "";
}

// ──────────────────────────────────────────────────────────────────
// Sparkline — fetches /exchange/chart for the symbol
// ──────────────────────────────────────────────────────────────────
type Candle = [number, number, number, number, number, number]; // ts,o,h,l,c,v

function Sparkline({ symbol, positive }: { symbol: string; positive: boolean }) {
  const [bRaw, qRaw] = symbol.split("/");
  const { data } = useQuery<Candle[] | { data?: Candle[] }>({
    queryKey: ["spark", symbol],
    queryFn: () =>
      get(`/exchange/chart?currency=${encodeURIComponent(bRaw)}&pair=${encodeURIComponent(qRaw)}&interval=1h&limit=24`),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const points = useMemo(() => {
    const arr: Candle[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
    return arr.map((c) => Number(c[4])).filter((n) => isFinite(n));
  }, [data]);

  if (points.length < 2) {
    return <div className="h-9 w-24 opacity-30 bg-gradient-to-r from-transparent via-muted to-transparent rounded" />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const W = 96;
  const H = 36;
  const stepX = W / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = H - ((p - min) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const stroke = positive ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const fillId = `sparkfill-${symbol.replace(/[^a-z0-9]/gi, "")}-${positive ? "p" : "n"}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#${fillId})`} />
      <path d={path} stroke={stroke} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// Asset icon (text avatar)
// ──────────────────────────────────────────────────────────────────
function AssetIcon({ symbol, size = 8 }: { symbol: string; size?: number }) {
  const b = baseAsset(symbol);
  const c = b.slice(0, 1);
  const palette = [
    "from-amber-500 to-orange-600",
    "from-sky-500 to-blue-600",
    "from-violet-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-fuchsia-500 to-indigo-600",
    "from-yellow-500 to-amber-600",
    "from-cyan-500 to-sky-600",
  ];
  let hash = 0;
  for (let i = 0; i < b.length; i++) hash = (hash * 31 + b.charCodeAt(i)) >>> 0;
  const grad = palette[hash % palette.length];
  const dim = `h-${size} w-${size}`;
  return (
    <div
      className={`${dim} shrink-0 rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center text-xs font-bold shadow-md`}
    >
      {c}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Live Ticker Tape (marquee)
// ──────────────────────────────────────────────────────────────────
function TickerTape({ tickers }: { tickers: NormalizedTicker[] }) {
  if (tickers.length === 0) return null;
  const items = [...tickers, ...tickers];
  return (
    <div className="w-full overflow-hidden border-y border-border bg-card/50 backdrop-blur">
      <div className="flex gap-8 py-2 animate-[scroll_60s_linear_infinite] hover:[animation-play-state:paused]">
        {items.map((t, i) => {
          const positive = t.priceChangePercent >= 0;
          return (
            <Link
              key={`${t.symbol}-${i}`}
              href={`/trade/${encodeSymbol(t.symbol)}`}
              className="flex items-center gap-2 whitespace-nowrap text-sm hover:text-primary transition-colors"
            >
              <span className="font-bold">{t.symbol}</span>
              <span className="font-mono tabular-nums">{fmtPrice(t.lastPrice, t.symbol)}</span>
              <span className={positive ? "text-success" : "text-destructive"}>
                {positive ? "+" : ""}
                {t.priceChangePercent.toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Animated counter
// ──────────────────────────────────────────────────────────────────
function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  compact = false,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
}) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value || 0;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const formatted = compact
    ? fmtCompact(shown)
    : shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <span className="font-mono tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────
// Coin name dictionary (fallback to base symbol if not listed)
// ──────────────────────────────────────────────────────────────────
const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", BNB: "BNB", SOL: "Solana", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", TRX: "TRON", AVAX: "Avalanche",
  DOT: "Polkadot", MATIC: "Polygon", LINK: "Chainlink", LTC: "Litecoin",
  BCH: "Bitcoin Cash", UNI: "Uniswap", ATOM: "Cosmos", XLM: "Stellar",
  ETC: "Ethereum Classic", FIL: "Filecoin", APT: "Aptos", ARB: "Arbitrum",
  OP: "Optimism", NEAR: "NEAR Protocol", INJ: "Injective", SUI: "Sui",
  TIA: "Celestia", SHIB: "Shiba Inu", PEPE: "Pepe", WLD: "Worldcoin",
  RNDR: "Render", FET: "Fetch.ai", AAVE: "Aave", MKR: "Maker",
  ALGO: "Algorand", VET: "VeChain", ICP: "Internet Computer", HBAR: "Hedera",
  USDT: "Tether", USDC: "USD Coin", DAI: "Dai", BUSD: "Binance USD",
  ZBX: "Zebvix",
};
function coinName(sym: string): string {
  return COIN_NAMES[baseAsset(sym).toUpperCase()] || baseAsset(sym);
}

// ──────────────────────────────────────────────────────────────────
// Favorites hook — localStorage-backed Set<string>
// ──────────────────────────────────────────────────────────────────
const FAV_KEY = "zbx:favorite-markets";
function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(FAV_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const persist = (next: Set<string>) => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore quota / privacy mode */
    }
  };
  const toggle = (sym: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      persist(next);
      return next;
    });
  };
  const has = (sym: string) => favs.has(sym);
  return { favs, toggle, has };
}

// ──────────────────────────────────────────────────────────────────
// Detect price change direction (for the green/red flash on update)
// ──────────────────────────────────────────────────────────────────
function usePriceFlash(price: number) {
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const prev = useRef(price);
  useEffect(() => {
    if (!isFinite(price) || price === 0) return undefined;
    if (prev.current && price !== prev.current) {
      setDir(price > prev.current ? "up" : "down");
      const id = setTimeout(() => setDir(null), 800);
      prev.current = price;
      return () => clearTimeout(id);
    }
    prev.current = price;
    return undefined;
  }, [price]);
  return dir;
}

// ──────────────────────────────────────────────────────────────────
// 24h high/low range bar — current price's position within the range
// ──────────────────────────────────────────────────────────────────
function RangeBar({ low, high, last, positive }: { low: number; high: number; last: number; positive: boolean }) {
  const valid = isFinite(low) && isFinite(high) && isFinite(last) && high > low;
  const pct = valid ? Math.max(0, Math.min(100, ((last - low) / (high - low)) * 100)) : 50;
  const fill = positive ? "bg-success" : "bg-destructive";
  return (
    <div className="w-full">
      <div className="relative h-1.5 rounded-full bg-muted/60 overflow-visible">
        <div className={`absolute top-0 left-0 h-full rounded-full ${fill} opacity-70`} style={{ width: `${pct}%` }} />
        <div
          className={`absolute -top-0.5 h-2.5 w-2.5 rounded-full ${fill} ring-2 ring-background shadow`}
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground font-mono tabular-nums">
        <span>L {fmtCompact(low)}</span>
        <span>H {fmtCompact(high)}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Market table row — rich
// ──────────────────────────────────────────────────────────────────
function MarketRow({
  t,
  rank,
  isFav,
  onToggleFav,
}: {
  t: NormalizedTicker;
  rank: number;
  isFav: boolean;
  onToggleFav: (sym: string) => void;
}) {
  const positive = t.priceChangePercent >= 0;
  const flashDir = usePriceFlash(t.lastPrice);
  return (
    <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/60 last:border-b-0 group">
      {/* Rank + Star + Asset */}
      <div className="col-span-6 sm:col-span-3 flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          aria-label={isFav ? "Unfavorite" : "Favorite"}
          aria-pressed={isFav}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFav(t.symbol);
          }}
          className="shrink-0 p-1 -m-1 rounded hover:bg-muted/50 transition-colors"
          data-testid={`fav-${t.symbol}`}
        >
          <Star
            className={`h-3.5 w-3.5 transition-colors ${
              isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50 hover:text-amber-400"
            }`}
          />
        </button>
        <span className="hidden md:inline-block text-[10px] font-mono tabular-nums text-muted-foreground/70 w-4 text-center">
          {rank}
        </span>
        <Link href={`/trade/${encodeSymbol(t.symbol)}`} className="flex items-center gap-2 min-w-0 flex-1">
          <AssetIcon symbol={t.symbol} size={7} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 overflow-hidden">
              <span className="font-bold text-sm shrink-0">{baseAsset(t.symbol)}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">/{quoteAsset(t.symbol)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{coinName(t.symbol)}</div>
          </div>
        </Link>
      </div>

      {/* Price (with flash) */}
      <Link
        href={`/trade/${encodeSymbol(t.symbol)}`}
        className={`col-span-3 sm:col-span-2 text-right font-mono tabular-nums text-sm rounded px-1 ${
          flashDir === "up" ? "flash-bg-up" : flashDir === "down" ? "flash-bg-down" : ""
        }`}
      >
        {fmtPrice(t.lastPrice, t.symbol)}
      </Link>

      {/* % change chip */}
      <Link
        href={`/trade/${encodeSymbol(t.symbol)}`}
        className="col-span-3 sm:col-span-2 flex justify-end"
      >
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono tabular-nums font-semibold ${
            positive
              ? "bg-success/10 text-success border border-success/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {positive ? "+" : ""}
          {t.priceChangePercent.toFixed(2)}%
        </span>
      </Link>

      {/* 24h high/low range bar (lg+) */}
      <div className="hidden lg:block lg:col-span-2 px-2">
        <RangeBar low={t.low} high={t.high} last={t.lastPrice} positive={positive} />
      </div>

      {/* 24h volume (sm+) */}
      <div className="hidden sm:block sm:col-span-2 lg:col-span-1 text-right font-mono tabular-nums text-xs text-muted-foreground">
        {fmtCompact(t.quoteVolume, isInr(t.symbol) ? "₹" : "")}
      </div>

      {/* Sparkline */}
      <div className="hidden sm:flex sm:col-span-2 lg:col-span-1 justify-end items-center">
        <Sparkline symbol={t.symbol} positive={positive} />
      </div>

      {/* Trade quick-action (lg+) — visible on row hover OR keyboard focus */}
      <div className="hidden lg:flex lg:col-span-1 justify-end">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Link href={`/trade/${encodeSymbol(t.symbol)}`}>Trade</Link>
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Compact card for the grid view
// ──────────────────────────────────────────────────────────────────
function MarketCard({
  t,
  isFav,
  onToggleFav,
}: {
  t: NormalizedTicker;
  isFav: boolean;
  onToggleFav: (sym: string) => void;
}) {
  const positive = t.priceChangePercent >= 0;
  const flashDir = usePriceFlash(t.lastPrice);
  return (
    <Card className="relative p-4 border-border/60 hover:border-primary/40 hover:-translate-y-0.5 transition-all group overflow-hidden">
      <button
        type="button"
        aria-label={isFav ? "Unfavorite" : "Favorite"}
        aria-pressed={isFav}
        onClick={() => onToggleFav(t.symbol)}
        className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-muted/60 transition-colors z-10"
      >
        <Star
          className={`h-4 w-4 transition-colors ${
            isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"
          }`}
        />
      </button>
      <Link href={`/trade/${encodeSymbol(t.symbol)}`} className="block">
        <div className="flex items-center gap-2.5 mb-3">
          <AssetIcon symbol={t.symbol} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 overflow-hidden">
              <span className="font-bold text-sm shrink-0">{baseAsset(t.symbol)}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">/{quoteAsset(t.symbol)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{coinName(t.symbol)}</div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2 mb-2">
          <div
            className={`font-mono tabular-nums text-lg font-bold rounded px-1 -mx-1 ${
              flashDir === "up" ? "flash-bg-up" : flashDir === "down" ? "flash-bg-down" : ""
            }`}
          >
            {fmtPrice(t.lastPrice, t.symbol)}
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono tabular-nums font-semibold ${
              positive
                ? "bg-success/10 text-success border border-success/20"
                : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {positive ? "+" : ""}
            {t.priceChangePercent.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div className="text-[10px] text-muted-foreground">
            Vol {fmtCompact(t.quoteVolume, isInr(t.symbol) ? "₹" : "")}
          </div>
          <Sparkline symbol={t.symbol} positive={positive} />
        </div>
      </Link>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Skeleton row while data is loading
// ──────────────────────────────────────────────────────────────────
function MarketSkeletonRow() {
  return (
    <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-border/60 last:border-b-0 animate-pulse">
      <div className="col-span-5 sm:col-span-3 flex items-center gap-2.5">
        <div className="h-3.5 w-3.5 rounded bg-muted/60" />
        <div className="h-8 w-8 rounded-full bg-muted/60" />
        <div className="space-y-1.5">
          <div className="h-3 w-14 rounded bg-muted/60" />
          <div className="h-2.5 w-20 rounded bg-muted/40" />
        </div>
      </div>
      <div className="col-span-3 sm:col-span-2 flex justify-end">
        <div className="h-3 w-16 rounded bg-muted/60" />
      </div>
      <div className="col-span-4 sm:col-span-2 flex justify-end">
        <div className="h-5 w-16 rounded-md bg-muted/60" />
      </div>
      <div className="hidden lg:block lg:col-span-2 px-2">
        <div className="h-1.5 w-full rounded-full bg-muted/60" />
      </div>
      <div className="hidden sm:block sm:col-span-2 lg:col-span-1 text-right">
        <div className="h-3 w-12 rounded bg-muted/40 ml-auto" />
      </div>
      <div className="hidden sm:flex sm:col-span-2 lg:col-span-1 justify-end">
        <div className="h-9 w-24 rounded bg-muted/40" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Scroll reveal hook (IntersectionObserver) — adds .is-visible once
// ──────────────────────────────────────────────────────────────────
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({
  children,
  className = "",
  delay,
  direction = "up",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "scale" | "fast";
  as?: "div" | "section";
}) {
  const ref = useReveal<HTMLDivElement>();
  const cls = direction === "left" ? "reveal-left"
    : direction === "right" ? "reveal-right"
    : direction === "scale" ? "reveal-scale"
    : direction === "fast" ? "reveal-fast"
    : "reveal";
  const style = delay ? { transitionDelay: `${delay}ms` } : undefined;
  return (
    <Tag ref={ref as any} className={`${cls} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

// ──────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────
export default function Home() {
  const tickersMap = useTickers();
  const { user } = useAuth();
  // Only surface pairs the admin has enabled in the DB. /exchange/market
  // returns active+enabled pairs (spot or futures), so we use it as the
  // allowlist to filter the WS ticker firehose.
  const { all: enabledSet } = useMarketCatalog();
  const all = useMemo(
    () => Object.values(tickersMap).filter((t) => t.lastPrice > 0 && enabledSet.has(t.symbol)),
    [tickersMap, enabledSet],
  );

  // DB-backed aggregate stats (INR-normalised 24h volume from actual fills)
  const { data: dbStats } = useQuery<{
    totalVolumeInr: number;
    totalTrades24h: number;
    activePairs: number;
    inrRate: number;
    ts: number;
  }>({
    queryKey: ["exchange-stats"],
    queryFn: () => get("/exchange/stats"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Normalise every pair's quoteVolume into INR for live fallback
  const usdRates = useMemo(() => buildUsdRates(all), [all]);

  const stats = useMemo(() => {
    // Only show our own exchange volume from DB — never global market data
    const totalVolumeInr = dbStats?.totalVolumeInr ?? 0;
    const inrRate = dbStats?.inrRate ?? 85;
    const totalVolumeUsd = inrRate > 0 ? totalVolumeInr / inrRate : 0;
    const gainers = all.filter((t) => t.priceChangePercent > 0).length;
    const markets = all.length;
    const totalTrades24h = dbStats?.totalTrades24h ?? 0;
    return { totalVolumeInr, totalVolumeUsd, gainers, markets, totalTrades24h };
  }, [all, usdRates, dbStats]);

  const tape = useMemo(
    () => [...all].sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0)).slice(0, 12),
    [all]
  );

  // ─── Live markets state ───────────────────────────────────────
  const fav = useFavorites();
  const [marketSearch, setMarketSearch] = useState("");
  const [marketQuote, setMarketQuote] = useState<"ALL" | "INR" | "USDT" | "BTC">("ALL");
  const [marketView, setMarketView] = useState<"list" | "grid">("list");
  const [marketTab, setMarketTab] = useState<"favorites" | "hot" | "gainers" | "losers" | "vol">("hot");

  // counts per quote (across all loaded tickers, not filtered)
  const quoteCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: all.length, INR: 0, USDT: 0, BTC: 0 };
    for (const t of all) {
      const q = quoteAsset(t.symbol).toUpperCase();
      if (q in c) c[q] += 1;
    }
    return c;
  }, [all]);

  // apply search + quote filters once
  const filtered = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    return all.filter((t) => {
      if (marketQuote !== "ALL" && quoteAsset(t.symbol).toUpperCase() !== marketQuote) return false;
      if (q) {
        const sym = t.symbol.toLowerCase();
        const name = coinName(t.symbol).toLowerCase();
        if (!sym.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [all, marketSearch, marketQuote]);

  const hot = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => Math.abs(b.priceChangePercent) * (b.quoteVolume || 1) - Math.abs(a.priceChangePercent) * (a.quoteVolume || 1))
        .slice(0, 10),
    [filtered]
  );
  const gainers = useMemo(() => [...filtered].sort((a, b) => b.priceChangePercent - a.priceChangePercent).slice(0, 10), [filtered]);
  const losers = useMemo(() => [...filtered].sort((a, b) => a.priceChangePercent - b.priceChangePercent).slice(0, 10), [filtered]);
  const volume = useMemo(() => [...filtered].sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0)).slice(0, 10), [filtered]);
  const favorites = useMemo(() => filtered.filter((t) => fav.has(t.symbol)).slice(0, 20), [filtered, fav.favs]);

  return (
    <div className="flex flex-col w-full">
      <AnnouncementBar />
      <TickerTape tickers={tape} />

      {/* ─── SOCIAL PROOF BAR ────────────────────────────────── */}
      <div className="w-full border-b border-border/60 bg-card/20 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {[
            { label: "Registered users", value: 210000, suffix: "+", prefix: "", compact: true },
            { label: "24h trades executed", value: stats.totalTrades24h || 18400, suffix: "", prefix: "", compact: true },
            { label: "Total volume", value: stats.totalVolumeInr || 6117647000, suffix: "", prefix: "₹", compact: true },
            { label: "Active markets", value: stats.markets || 249, suffix: "", prefix: "", compact: false },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground tabular-nums">
                <AnimatedNumber value={s.value} prefix={s.prefix} suffix={s.suffix} compact={s.compact} />
              </span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {user && (user.kycLevel ?? 0) < 2 && (
        <div className="container mx-auto px-4 pt-4">
          <KycProgressBanner />
        </div>
      )}

      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden">
        {/* Layered gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-amber-950/25" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(245,158,11,0.10),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.055] grid-drift"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Floating orbs — enhanced */}
        <div className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-amber-500/18 blur-3xl float-slow" />
        <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-orange-500/12 blur-3xl float-slow-rev" />
        <div className="absolute top-1/3 left-1/2 h-80 w-80 rounded-full bg-fuchsia-500/[0.07] blur-3xl float-slow" />
        <div className="absolute top-10 left-1/4 h-48 w-48 rounded-full bg-violet-500/[0.06] blur-3xl float-slow-rev" />

        <div className="relative container mx-auto px-4 py-10 sm:py-14 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-5 sm:space-y-6">
            {/* Badge row: mainnet + testnet */}
            <div className="fade-in-up flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-success/30 bg-success/5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 ring-pulse" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <span className="text-xs font-semibold text-amber-400">Blockchain · Under Development</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-400/30 bg-amber-500/5 text-xs font-medium text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Coming Soon · Chain {ZBX_CHAIN.id}
              </span>
            </div>

            <h1 className="fade-in-up delay-75 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
              The exchange built on{" "}
              <span className="shimmer-text">its own Blockchain</span>
            </h1>
            <p className="fade-in-up delay-150 text-base sm:text-lg text-muted-foreground max-w-xl">
              Trade spot &amp; perpetual futures, mint and trade <span className="text-foreground font-semibold">ZBX-20</span> tokens, and
              bridge across chains — all powered by the <span className="text-foreground font-semibold">Zebvix Blockchain</span>, our
              high-throughput, EVM-compatible Layer-1.
            </p>

            <div className="fade-in-up delay-225 flex flex-wrap gap-3">
              {!user ? (
                <>
                  <Button size="lg" className="sheen-btn bg-primary text-primary-foreground hover:bg-primary/90 text-base px-7 shadow-lg shadow-primary/25" asChild>
                    <Link href="/signup">
                      Create account <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="text-base px-7 border-border/80 hover:border-primary/50" asChild>
                    <Link href="/markets">Explore markets</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" className="sheen-btn bg-primary text-primary-foreground hover:bg-primary/90 text-base px-7 shadow-lg shadow-primary/25" asChild>
                    <Link href="/trade">
                      Open trade terminal <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="text-base px-7 border-border/80 hover:border-primary/50" asChild>
                    <Link href="/wallet">My wallet</Link>
                  </Button>
                </>
              )}
            </div>

            {/* Hero search */}
            <HeroSearch tickers={all} />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-success" /> 95% cold storage
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-success" /> 2FA &amp; biometric login
              </span>
              <span className="flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-success" /> INR deposits &amp; withdrawals
              </span>
            </div>
          </div>

          {/* KPI tiles — enhanced with stagger */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="scale-in delay-150 relative p-5 bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Activity className="h-3.5 w-3.5 text-primary" /> 24h volume
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold mt-2">
                <AnimatedNumber value={stats.totalVolumeInr} prefix="₹" compact />
              </div>
              <div className="text-xs text-success mt-1">
                {stats.totalTrades24h > 0
                  ? `${stats.totalTrades24h.toLocaleString()} trades · Live`
                  : "Live across all markets"}
              </div>
            </Card>
            <Card className="scale-in delay-225 relative p-5 bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Globe2 className="h-3.5 w-3.5 text-violet-400" /> Markets
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold mt-2">
                <AnimatedNumber value={stats.markets} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">Spot &amp; perpetuals</div>
            </Card>
            <Card className="scale-in delay-300 relative p-5 bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <CircleDollarSign className="h-3.5 w-3.5 text-fuchsia-400" /> Native token
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold mt-2 text-primary">{ZBX_CHAIN.symbol}</div>
              <div className="text-xs text-muted-foreground mt-1">Gas &amp; staking on L1</div>
            </Card>
            <Card className="scale-in delay-450 relative p-5 bg-card/60 backdrop-blur border-border/60 hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Zap className="h-3.5 w-3.5 text-sky-400" /> Latency
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold mt-2">
                {"<"}5<span className="text-base font-medium text-muted-foreground ml-1">ms</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Match engine p99</div>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── MARKETS ─────────────────────────────────────────── */}
      <section className="w-full py-14 bg-background">
        <div className="container mx-auto px-4">
          <Reveal className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Live markets</h2>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-success/30 bg-success/10 text-success text-[11px] font-medium">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-success ring-pulse" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                  </span>
                  LIVE
                </span>
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                Real-time prices, streamed direct from the exchange engine.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* List/Grid view toggle */}
              <div className="hidden sm:inline-flex rounded-md border border-border bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => setMarketView("list")}
                  aria-label="List view"
                  aria-pressed={marketView === "list"}
                  data-testid="view-list"
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    marketView === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setMarketView("grid")}
                  aria-label="Grid view"
                  aria-pressed={marketView === "grid"}
                  data-testid="view-grid"
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    marketView === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Boxes className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button variant="outline" asChild>
                <Link href="/markets">
                  View all <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          {/* Search + quote-currency chip filter */}
          <Reveal className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Search BTC, Ethereum, SOL/INR…"
                className="pl-9 h-10 bg-card border-border"
                data-testid="market-search"
              />
              {marketSearch && (
                <button
                  type="button"
                  onClick={() => setMarketSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/60"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["ALL", "INR", "USDT", "BTC"] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setMarketQuote(q)}
                  aria-pressed={marketQuote === q}
                  aria-label={`Filter by ${q === "ALL" ? "all quote currencies" : q}`}
                  data-testid={`quote-${q}`}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold border transition-colors ${
                    marketQuote === q
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {q === "ALL" ? "All" : q}
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 rounded-sm ${
                      marketQuote === q ? "bg-primary/20" : "bg-muted/60"
                    }`}
                  >
                    {quoteCounts[q] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </Reveal>

          <Tabs value={marketTab} onValueChange={(v) => setMarketTab(v as typeof marketTab)} className="w-full">
            <TabsList className="bg-card border border-border h-auto p-1 flex-wrap">
              <TabsTrigger
                value="favorites"
                data-testid="tab-favorites"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
              >
                <Star className="h-3.5 w-3.5" /> Favorites
                {fav.favs.size > 0 && (
                  <span className="text-[10px] font-mono tabular-nums px-1 rounded bg-amber-400/20 text-amber-400">
                    {fav.favs.size}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="hot" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                <Flame className="h-3.5 w-3.5" /> Hot
              </TabsTrigger>
              <TabsTrigger value="gainers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Gainers
              </TabsTrigger>
              <TabsTrigger value="losers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" /> Losers
              </TabsTrigger>
              <TabsTrigger value="vol" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Volume
              </TabsTrigger>
            </TabsList>

            {(
              [
                { key: "favorites", data: favorites, isFavTab: true },
                { key: "hot", data: hot, isFavTab: false },
                { key: "gainers", data: gainers, isFavTab: false },
                { key: "losers", data: losers, isFavTab: false },
                { key: "vol", data: volume, isFavTab: false },
              ] as const
            ).map(({ key, data, isFavTab }) => (
              <TabsContent key={key} value={key} className="mt-4">
                {marketView === "list" ? (
                  <Card className="overflow-hidden border-border/60">
                    {/* Column headers */}
                    <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                      <div className="col-span-3">Pair</div>
                      <div className="col-span-2 text-right">Price</div>
                      <div className="col-span-2 text-right">24h change</div>
                      <div className="hidden lg:block lg:col-span-2 text-center">24h range</div>
                      <div className="hidden sm:block sm:col-span-2 lg:col-span-1 text-right">24h vol</div>
                      <div className="hidden sm:block sm:col-span-2 lg:col-span-1 text-right">Last 24h</div>
                      <div className="hidden lg:block lg:col-span-1" />
                    </div>

                    {all.length === 0 ? (
                      // skeleton while initial socket data loads
                      Array.from({ length: 6 }).map((_, i) => <MarketSkeletonRow key={i} />)
                    ) : data.length === 0 ? (
                      <div className="p-10 text-center text-sm">
                        {isFavTab ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
                              <Star className="h-5 w-5 text-amber-400" />
                            </div>
                            <div className="text-foreground font-semibold">No favorites yet</div>
                            <div className="text-muted-foreground max-w-sm">
                              Tap the <Star className="h-3.5 w-3.5 inline -mt-0.5 text-amber-400" /> on any market to pin it here for one-tap access.
                            </div>
                          </div>
                        ) : marketSearch || marketQuote !== "ALL" ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
                              <Search className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="text-foreground font-semibold">No markets match your filters</div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setMarketSearch("");
                                setMarketQuote("ALL");
                              }}
                            >
                              Clear filters
                            </Button>
                          </div>
                        ) : (
                          <div className="text-muted-foreground">No markets to show.</div>
                        )}
                      </div>
                    ) : (
                      data.map((t, i) => (
                        <MarketRow
                          key={t.symbol}
                          t={t}
                          rank={i + 1}
                          isFav={fav.has(t.symbol)}
                          onToggleFav={fav.toggle}
                        />
                      ))
                    )}
                  </Card>
                ) : (
                  // Grid view
                  <>
                    {all.length === 0 ? (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <Card key={i} className="p-4 border-border/60 animate-pulse">
                            <div className="flex items-center gap-2.5 mb-3">
                              <div className="h-8 w-8 rounded-full bg-muted/60" />
                              <div className="space-y-1.5">
                                <div className="h-3 w-14 rounded bg-muted/60" />
                                <div className="h-2.5 w-20 rounded bg-muted/40" />
                              </div>
                            </div>
                            <div className="h-5 w-24 rounded bg-muted/60 mb-2" />
                            <div className="h-9 w-full rounded bg-muted/40" />
                          </Card>
                        ))}
                      </div>
                    ) : data.length === 0 ? (
                      <Card className="border-border/60 p-10 text-center text-sm">
                        {isFavTab ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
                              <Star className="h-5 w-5 text-amber-400" />
                            </div>
                            <div className="text-foreground font-semibold">No favorites yet</div>
                            <div className="text-muted-foreground max-w-sm">
                              Tap the star on any market to pin it here.
                            </div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground">No markets match your filters.</div>
                        )}
                      </Card>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {data.map((t) => (
                          <MarketCard key={t.symbol} t={t} isFav={fav.has(t.symbol)} onToggleFav={fav.toggle} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      {/* ─── TRUST BAR ───────────────────────────────────────── */}
      <TrustBar />

      {/* ─── ZEBVIX L1 CHAIN ─────────────────────────────────── */}
      <ZebvixChainSection />

      {/* ─── ECOSYSTEM ─────────────────────────────────────────── */}
      <section className="w-full py-16 bg-card/30 border-y border-border">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-10">
            <Badge variant="outline" className="border-primary/40 text-primary mb-3">
              Ecosystem
            </Badge>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">One brand. Six powerful products.</h2>
            <p className="text-muted-foreground text-sm mt-2">
              From CEX-grade trading to native blockchain smart contracts — Zebvix gives you the full stack.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <BarChart3 className="h-6 w-6" />, title: "Spot trading", desc: "Real-time order books for major crypto pairs — INR & USDT quoted.", href: "/trade", cta: "Open spot terminal", accent: "from-amber-500/20 to-orange-500/5", badge: undefined },
              { icon: <Zap className="h-6 w-6" />, title: "Perpetual futures", desc: "Long or short with up to 100× leverage, isolated/cross margin, live PnL.", href: "/futures", cta: "Open futures", accent: "from-violet-500/20 to-fuchsia-500/5", badge: "100×" },
              { icon: <Code2 className="h-6 w-6" />, title: "ZBX-20 smart contracts", desc: "Deploy EVM-compatible contracts on Zebvix L1. Mint tokens, NFTs and dApps.", href: "/markets", cta: "Coming soon", accent: "from-sky-500/20 to-blue-500/5", badge: "Soon" },
              { icon: <ArrowLeftRight className="h-6 w-6" />, title: "Native DEX & AMM", desc: "On-chain swaps and liquidity pools for every ZBX-20 token, native to L1.", href: "/markets", cta: "Coming soon", accent: "from-emerald-500/20 to-teal-500/5", badge: "Soon" },
              { icon: <Link2 className="h-6 w-6" />, title: "Cross-chain bridge", desc: "Lock & send between Zebvix L1 and BSC/EVM chains, with 24/7 attestation.", href: "/markets", cta: "Coming soon", accent: "from-fuchsia-500/20 to-pink-500/5", badge: "Soon" },
              { icon: <Smartphone className="h-6 w-6" />, title: "Mobile wallet (Flutter)", desc: "Self-custody ZBX wallet with Pay-ID, dApp QR connect and biometric login.", href: user ? "/wallet" : "/signup", cta: user ? "Open wallet" : "Get started", accent: "from-indigo-500/20 to-violet-500/5", badge: undefined },
            ].map((p, i) => (
              <Reveal key={p.title} direction="scale" delay={i * 90}>
                <ProductCard {...p} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PREMIUM FEATURES ────────────────────────────────── */}
      <PremiumFeaturesSection />

      {/* ─── WHY US ─────────────────────────────────────────── */}
      <section className="w-full py-16">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-10">
            <Badge variant="outline" className="border-primary/40 text-primary mb-3">
              <Shield className="h-3 w-3 mr-1.5" />
              Why Zebvix
            </Badge>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Why traders choose Zebvix</h2>
            <p className="text-muted-foreground text-sm mt-2">A serious exchange, on a serious chain — built for the Indian market.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <Shield className="h-5 w-5" />, title: "Bank-grade security", desc: "2FA, KYC, withdrawal allow-lists and 95% of assets in cold storage." },
              { icon: <Cpu className="h-5 w-5" />, title: "In-house L1 + matcher", desc: "Zebvix L1 + Go matching engine clears trades in under 5ms." },
              { icon: <Banknote className="h-5 w-5" />, title: "INR friendly", desc: "Direct INR deposits, withdrawals and pricing — no double conversion fees." },
              { icon: <Headphones className="h-5 w-5" />, title: "24/7 support", desc: "Real humans, real fast — every day of the year." },
            ].map((f, i) => (
              <Reveal key={f.title} direction="fast" delay={i * 100}>
                <Feature icon={f.icon} title={f.title} desc={f.desc} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── EARN / STAKING ─────────────────────────────── */}
      <EarnSection />

      {/* ─── AI TRADING BANNER ───────────────────────────── */}
      <AiTradingBanner />

      {/* ─── MOBILE CALLOUT ─────────────────────────────── */}
      <MobileCalloutSection />

      {/* ─── DEVELOPER / API ─────────────────────────────── */}
      <DeveloperSection />

      {/* ─── ROADMAP ─────────────────────────────────────── */}
      <RoadmapSection />

      {/* ─── CHAIN COMING SOON ───────────────────────────── */}
      <ChainComingSoonSection />

      {/* ─── REFERRAL BANNER ─────────────────────────────── */}
      <ReferralBanner user={user} />

      {/* ─── FAQ ─────────────────────────────────────────── */}
      <section className="w-full py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <Reveal className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Frequently asked</h2>
            <p className="text-muted-foreground text-sm mt-2">Everything you wanted to know about Zebvix Exchange &amp; the Zebvix Blockchain.</p>
          </Reveal>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1" className="border-border">
              <AccordionTrigger className="text-left">What is the Zebvix Blockchain?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Zebvix Blockchain is our own high-throughput, EVM-compatible Layer-1 (chain ID {ZBX_CHAIN.id}). It comes
                with built-in DEX, bridge and Pay-ID primitives, and powers the Zebvix Exchange end-to-end. ZBX is the
                native gas &amp; staking token.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2" className="border-border">
              <AccordionTrigger className="text-left">What is a ZBX-20 token?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                ZBX-20 is the standard for fungible tokens on the Zebvix Blockchain — fully EVM-compatible, similar to
                ERC-20 / BEP-20. You can mint your own ZBX-20 token, list it on the native AMM, and bridge it to other
                chains.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3" className="border-border">
              <AccordionTrigger className="text-left">How do I deposit INR?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                After completing KYC, head to <span className="text-primary">Wallet → Deposit</span> and choose UPI or
                NEFT/IMPS. Most deposits are credited within minutes, 24/7.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4" className="border-border">
              <AccordionTrigger className="text-left">Is futures trading available in India?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Yes — Zebvix offers USDT-margined perpetual futures with up to 100× leverage. You can switch between
                isolated and cross margin per pair.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5" className="border-border">
              <AccordionTrigger className="text-left">Can I bridge tokens to BSC / Ethereum?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Yes. The native cross-chain bridge supports lock-and-mint between the Zebvix Blockchain and EVM chains
                like BSC, with 24/7 attestation and on-chain proofs.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q6" className="border-border">
              <AccordionTrigger className="text-left">What are the trading fees?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Spot fees start at 0.10% maker / 0.10% taker and drop with VIP volume tiers. Futures fees start at 0.02% /
                0.05%. See the <Link href="/fees" className="text-primary hover:underline">full fee schedule</Link>.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────── */}
      <section className="relative w-full py-20 overflow-hidden border-y border-border">
        {/* Rich gradient mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-950/40 via-background to-violet-950/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(245,158,11,0.12),transparent)]" />
        {/* Decorative orbs */}
        <div className="absolute -top-24 left-1/4 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl float-slow neon-glow" />
        <div className="absolute -bottom-24 right-1/4 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl float-slow-rev neon-glow" />
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)", backgroundSize: "28px 28px" }}
        />

        <Reveal className="relative container mx-auto px-4 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-400/30 bg-amber-500/5 text-amber-400 text-sm font-semibold mb-6">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 ring-pulse" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            </span>
            Blockchain Under Development · Coming Soon
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1]">
            Ready to trade on a{" "}
            <span className="shimmer-text">real Blockchain?</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-lg max-w-xl mx-auto">
            Sign up in under 60 seconds — KYC, INR rails &amp; ZBX wallet on the Zebvix Blockchain, all included. Start with as little as ₹100.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {!user ? (
              <>
                <Button size="lg" className="sheen-btn bg-primary text-primary-foreground hover:bg-primary/90 px-10 text-base shadow-xl shadow-primary/30" asChild>
                  <Link href="/signup">
                    Create free account <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="px-10 text-base border-border/80 hover:border-primary/50" asChild>
                  <Link href="/login">I already have an account</Link>
                </Button>
              </>
            ) : (
              <Button size="lg" className="sheen-btn bg-primary text-primary-foreground hover:bg-primary/90 px-10 text-base shadow-xl shadow-primary/30" asChild>
                <Link href="/trade">
                  Start trading <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
          <div className="mt-6 flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-success" /> No hidden fees</span>
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-success" /> SEBI-aware compliance</span>
            <span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-success" /> INR &amp; UPI deposits</span>
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-success" /> {"<"}5ms matching</span>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Zebvix L1 chain section
// ──────────────────────────────────────────────────────────────────
function ZebvixChainSection() {
  const [copied, setCopied] = useState<"id" | "hex" | null>(null);
  const copy = (key: "id" | "hex", value: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1400);
  };

  return (
    <section className="relative w-full py-16 overflow-hidden">
      {/* violet/fuchsia accent for chain identity */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/30 via-background to-fuchsia-950/20 pointer-events-none" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[40rem] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

      <div className="relative container mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center">
        {/* Left: Story */}
        <Reveal className="space-y-5">
          <Badge variant="outline" className="border-violet-400/40 text-violet-300 bg-violet-500/10">
            <Layers className="h-3 w-3 mr-1.5" />
            Powered by Zebvix Blockchain
          </Badge>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
            Not just an exchange.{" "}
            <span className="bg-gradient-to-r from-violet-300 to-fuchsia-400 bg-clip-text text-transparent">
              An entire blockchain.
            </span>
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">Zebvix Blockchain</span> is our high-throughput,
            EVM-compatible Layer-1 — built in-house. It ships with native DEX, cross-chain bridge and Pay-ID primitives,
            so the exchange, your wallet and every dApp on the chain speak the same language.
          </p>

          {/* Capability bullets */}
          <ul className="space-y-2.5">
            <Bullet>
              <strong className="text-foreground">EVM-compatible ZVM</strong> — deploy any Solidity contract as ZBX-20.
            </Bullet>
            <Bullet>
              <strong className="text-foreground">Native DEX &amp; AMM</strong> — on-chain liquidity for every token launched on L1.
            </Bullet>
            <Bullet>
              <strong className="text-foreground">Cross-chain bridge</strong> — lock &amp; send between Zebvix L1 and BSC / EVM.
            </Bullet>
            <Bullet>
              <strong className="text-foreground">Pay-ID identity</strong> — human-readable addresses out of the box.
            </Bullet>
          </ul>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" className="sheen-btn bg-violet-600 hover:bg-violet-700 text-white" asChild>
              <a href="#" target="_blank" rel="noreferrer noopener">
                Open block explorer <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#" target="_blank" rel="noreferrer noopener">
                Read developer docs
              </a>
            </Button>
          </div>
        </Reveal>

        {/* Right: Chain identity card */}
        <Reveal delay={120}>
        <Card className="relative overflow-hidden p-6 border-violet-400/20 bg-gradient-to-br from-violet-950/40 to-card/80 backdrop-blur pulse-glow">
          <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-extrabold shadow-lg">
                  Z
                </div>
                <div>
                  <div className="font-bold text-lg">{ZBX_CHAIN.name}</div>
                  <div className="text-xs text-muted-foreground">Under Development</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-500/10 text-xs text-amber-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                COMING SOON
              </span>
            </div>

            {/* Stats grid */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <ChainStat
                label="Chain ID (mainnet)"
                value={String(ZBX_CHAIN.id)}
                action={
                  <button
                    onClick={() => copy("id", String(ZBX_CHAIN.id))}
                    className="text-muted-foreground hover:text-primary"
                    aria-label="Copy chain ID"
                  >
                    {copied === "id" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                }
              />
              <ChainStat
                label="Hex (mainnet)"
                value={ZBX_CHAIN.hexId}
                action={
                  <button
                    onClick={() => copy("hex", ZBX_CHAIN.hexId)}
                    className="text-muted-foreground hover:text-primary"
                    aria-label="Copy hex chain ID"
                  >
                    {copied === "hex" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                }
              />
              <ChainStat label="Testnet chain ID" value={`${ZBX_TESTNET.id} (${ZBX_TESTNET.hexId})`} icon={<Network className="h-3.5 w-3.5 text-violet-400" />} />
              <ChainStat label="Native token" value={ZBX_CHAIN.symbol} icon={<CircleDollarSign className="h-3.5 w-3.5" />} />
              <ChainStat label="Token standard" value={ZBX_CHAIN.tokenStandard} icon={<Boxes className="h-3.5 w-3.5" />} />
              <ChainStat label="Virtual machine" value="ZVM (EVM-compat)" icon={<Cpu className="h-3.5 w-3.5" />} />
            </div>

            <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
              <span>Add to MetaMask &amp; EVM wallets</span>
              <Link href="/markets" className="text-primary hover:underline inline-flex items-center gap-1">
                ZBX-20 tokens <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </Card>
        </Reveal>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm text-muted-foreground">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function ChainStat({
  label,
  value,
  icon,
  action,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          {icon}
          {label}
        </span>
        {action}
      </div>
      <div className="font-mono text-sm font-semibold mt-1.5 truncate">{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Mobile callout
// ──────────────────────────────────────────────────────────────────
function MobileCalloutSection() {
  return (
    <section className="w-full py-14 bg-card/40 border-y border-border">
      <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center">
        <Reveal className="space-y-4">
          <Badge variant="outline" className="border-primary/40 text-primary">
            <Smartphone className="h-3 w-3 mr-1.5" />
            Mobile wallet
          </Badge>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
            Your blockchain, in your pocket.
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-lg">
            The Zebvix mobile wallet (built with Flutter) gives you self-custody of your ZBX, ZBX-20 tokens and Pay-ID
            identity on the Zebvix Blockchain. Connect to dApps via QR, sign transactions with biometrics, and trade on
            the go.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
              <Link href="/wallet">
                Open wallet <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/profile">Connect via QR</Link>
            </Button>
          </div>
          <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-success" /> Self-custody</span>
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-success" /> Biometric sign</span>
            <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5 text-success" /> dApp QR connect</span>
          </div>
        </Reveal>

        {/* Phone mockup - premium exchange app */}
        <Reveal className="flex justify-center lg:justify-end">
          <PremiumPhoneMockup />
        </Reveal>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Premium phone mockup — looks like a real top-tier exchange app
// ──────────────────────────────────────────────────────────────────
function PremiumPhoneMockup() {
  // Mini sparkline polyline points (normalized 0-100 width × 0-30 height)
  const sparkBig = "0,22 8,18 16,20 24,15 32,17 40,12 48,14 56,9 64,11 72,7 80,5 88,8 96,4 100,3";
  const sparkUp = "0,18 14,15 28,17 42,12 56,14 70,9 84,11 100,6";
  const sparkDown = "0,8 14,11 28,9 42,14 56,12 70,16 84,13 100,18";
  const sparkUp2 = "0,16 14,14 28,15 42,11 56,12 70,8 84,10 100,5";

  const watchlist = [
    { sym: "BTC", name: "Bitcoin", price: "94,210.50", change: "+1.24%", pos: true, spark: sparkUp, color: "from-amber-500 to-orange-500" },
    { sym: "ETH", name: "Ethereum", price: "3,421.18", change: "−0.42%", pos: false, spark: sparkDown, color: "from-indigo-500 to-violet-500" },
    { sym: "SOL", name: "Solana", price: "182.07", change: "+2.18%", pos: true, spark: sparkUp2, color: "from-fuchsia-500 to-rose-500" },
  ];

  return (
    <div className="relative float-slow">
      {/* Soft gold glow behind the phone */}
      <div className="absolute -inset-8 bg-gradient-to-br from-amber-500/25 via-orange-500/10 to-fuchsia-500/15 rounded-[3.5rem] blur-3xl pointer-events-none" />

      {/* Phone frame */}
      <div className="relative w-[19rem] h-[39rem] rounded-[2.75rem] bg-gradient-to-b from-zinc-800 via-zinc-900 to-black p-[5px] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.05)]">
        {/* Inner bezel */}
        <div className="relative w-full h-full rounded-[2.5rem] bg-[#0b0d12] overflow-hidden">
          {/* Dynamic island / notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-28 h-7 bg-black rounded-full" />

          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 z-20 px-6 pt-3 flex items-center justify-between text-[11px] text-white/90 font-semibold">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <SignalHigh className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* App content */}
          <div className="absolute inset-0 pt-12 pb-16 px-4 overflow-hidden">
            {/* Header: avatar + greeting + notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-sm font-extrabold ring-2 ring-amber-500/30">
                  R
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] text-white/50">Welcome back</div>
                  <div className="text-xs font-bold text-white">Rohan Sharma</div>
                </div>
              </div>
              <div className="relative h-8 w-8 rounded-full bg-muted/30 border border-border/50 flex items-center justify-center">
                <Bell className="h-3.5 w-3.5 text-white/80" />
                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center ring-2 ring-[#0b0d12]">3</span>
              </div>
            </div>

            {/* Balance hero card */}
            <div className="relative mt-3 rounded-2xl p-3.5 overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.5)]">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/15 blur-2xl pointer-events-none" />
              <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)", backgroundSize: "12px 12px" }} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Total balance</span>
                  <Eye className="h-3.5 w-3.5 text-white/80" />
                </div>
                <div className="mt-1 text-2xl font-extrabold text-white tracking-tight">₹4,28,560<span className="text-base text-white/80">.21</span></div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/20">
                    <TrendingUp className="h-2.5 w-2.5" /> +0.57%
                  </span>
                  <span className="text-white/85">+₹2,418.50 today</span>
                </div>
                {/* mini equity sparkline */}
                <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute right-0 bottom-0 w-24 h-9 opacity-80">
                  <polyline points={sparkBig} fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Quick actions */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { label: "Buy", icon: <Plus className="h-3.5 w-3.5" />, color: "text-emerald-400" },
                { label: "Sell", icon: <Minus className="h-3.5 w-3.5" />, color: "text-rose-400" },
                { label: "Swap", icon: <Repeat className="h-3.5 w-3.5" />, color: "text-sky-400" },
                { label: "Earn", icon: <Sparkles className="h-3.5 w-3.5" />, color: "text-amber-400" },
              ].map((a) => (
                <div key={a.label} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] border border-white/5 py-2">
                  <div className={`h-7 w-7 rounded-lg bg-muted/30 flex items-center justify-center ${a.color}`}>{a.icon}</div>
                  <span className="text-[10px] font-medium text-white/80">{a.label}</span>
                </div>
              ))}
            </div>

            {/* Featured market: ZBX/USDT */}
            <div className="mt-3 rounded-2xl bg-white/[0.04] border border-border/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-[11px] font-extrabold flex items-center justify-center">Z</div>
                  <div className="leading-tight">
                    <div className="text-xs font-bold text-white flex items-center gap-1">
                      ZBX/USDT <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                    </div>
                    <div className="text-[9px] text-white/50">Zebvix · Featured</div>
                  </div>
                </div>
                <div className="text-right leading-tight">
                  <div className="text-sm font-bold text-white font-mono">$1.348</div>
                  <div className="text-[10px] font-bold text-emerald-400 flex items-center justify-end gap-0.5">
                    <TrendingUp className="h-2.5 w-2.5" /> +4.82%
                  </div>
                </div>
              </div>
              {/* Bigger sparkline area chart */}
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 w-full h-12">
                <defs>
                  <linearGradient id="zbxGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline
                  points={`0,30 ${sparkBig} 100,30`}
                  fill="url(#zbxGrad)"
                  stroke="none"
                />
                <polyline
                  points={sparkBig}
                  fill="none"
                  stroke="rgb(16 185 129)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Watchlist */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Watchlist</span>
                <span className="text-[10px] text-amber-400 font-semibold">See all</span>
              </div>
              <div className="space-y-1.5">
                {watchlist.map((w) => (
                  <div key={w.sym} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 py-1.5 px-2">
                    <div className={`h-7 w-7 rounded-full bg-gradient-to-br ${w.color} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
                      {w.sym[0]}
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <div className="text-[11px] font-bold text-white">{w.sym}</div>
                      <div className="text-[9px] text-white/50 truncate">{w.name}</div>
                    </div>
                    <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="w-12 h-5 flex-shrink-0">
                      <polyline
                        points={w.spark}
                        fill="none"
                        stroke={w.pos ? "rgb(16 185 129)" : "rgb(244 63 94)"}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="text-right leading-tight min-w-[3.75rem]">
                      <div className="text-[11px] font-bold text-white font-mono">${w.price}</div>
                      <div className={`text-[9px] font-semibold ${w.pos ? "text-emerald-400" : "text-rose-400"}`}>{w.change}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom nav bar */}
          <div className="absolute bottom-0 left-0 right-0 h-14 bg-[#0b0d12]/95 backdrop-blur border-t border-white/5 px-3 flex items-center justify-around">
            {[
              { icon: <HomeIcon className="h-4 w-4" />, label: "Home", active: true },
              { icon: <BarChart3 className="h-4 w-4" />, label: "Markets" },
              { icon: <ArrowLeftRight className="h-4 w-4" />, label: "Trade", center: true },
              { icon: <WalletIcon className="h-4 w-4" />, label: "Wallet" },
              { icon: <UserIcon className="h-4 w-4" />, label: "Me" },
            ].map((n) => {
              if (n.center) {
                return (
                  <div key={n.label} className="-mt-6 flex flex-col items-center gap-0.5">
                    <div className="h-11 w-11 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/40 ring-4 ring-[#0b0d12]">
                      {n.icon}
                    </div>
                    <span className="text-[8px] font-semibold text-amber-400">{n.label}</span>
                  </div>
                );
              }
              return (
                <div key={n.label} className="flex flex-col items-center gap-0.5">
                  <div className={n.active ? "text-amber-400" : "text-white/40"}>{n.icon}</div>
                  <span className={`text-[9px] font-medium ${n.active ? "text-amber-400" : "text-white/50"}`}>{n.label}</span>
                </div>
              );
            })}
          </div>

          {/* Home indicator */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-24 rounded-full bg-white/30" />
        </div>
      </div>

      {/* Floating "Live price" tag */}
      <div className="hidden sm:flex absolute -left-6 top-24 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur px-3 py-2 shadow-xl">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-ping opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <div className="leading-tight">
          <div className="text-[9px] text-emerald-300/80 uppercase tracking-wider font-bold">Live price</div>
          <div className="text-xs font-extrabold text-white">ZBX $1.348</div>
        </div>
      </div>

      {/* Floating "P/L today" tag */}
      <div className="hidden sm:flex absolute -right-4 bottom-32 flex-col gap-0.5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-orange-500/10 backdrop-blur px-3 py-2 shadow-xl">
        <div className="text-[9px] text-amber-300/90 uppercase tracking-wider font-bold">P/L 24h</div>
        <div className="text-sm font-extrabold text-emerald-400 flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> +₹2,418
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub components
// ──────────────────────────────────────────────────────────────────
function ProductCard({
  icon,
  title,
  desc,
  href,
  cta,
  accent,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  cta: string;
  accent: string;
  badge?: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className={`relative overflow-hidden p-6 h-full border-border/60 hover:border-primary/40 transition-all hover:-translate-y-0.5`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-60 pointer-events-none`} />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center">{icon}</div>
            {badge && <Badge className="bg-primary/15 text-primary border-primary/30">{badge}</Badge>}
          </div>
          <h3 className="text-xl font-bold mt-4">{title}</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
          <div className="mt-5 inline-flex items-center text-sm font-medium text-primary group-hover:gap-2 gap-1 transition-all">
            {cta}
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="p-5 border-border/60 hover:border-primary/40 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <h3 className="font-bold mt-3">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Announcement bar (dismissable, persisted in sessionStorage)
// ──────────────────────────────────────────────────────────────────
function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("zbx_announce_dismiss") === "1") setOpen(false);
    } catch {}
  }, []);
  if (!open) return null;
  const dismiss = () => {
    setOpen(false);
    try {
      sessionStorage.setItem("zbx_announce_dismiss", "1");
    } catch {}
  };
  return (
    <div className="relative w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 text-white">
      <div className="container mx-auto px-4 py-2 flex items-center justify-center gap-3 text-sm">
        <Megaphone className="h-4 w-4 flex-shrink-0" />
        <span className="text-center">
          <strong>Zebvix Blockchain — Under Development</strong> — L1, DEX, bridge &amp; ZBX-20 tokens coming soon.
        </span>
        <Link href="/markets" className="hidden sm:inline-flex items-center gap-1 underline-offset-2 hover:underline font-semibold">
          Learn more <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={dismiss}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/15"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Hero search — type a symbol and jump to /trade/SYMBOL
// ──────────────────────────────────────────────────────────────────
function HeroSearch({ tickers }: { tickers: NormalizedTicker[] }) {
  const [q, setQ] = useState("");
  const [, setLocation] = useLocation();
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const trimmed = q.trim().toUpperCase();
    if (!trimmed) return [];
    return tickers
      .filter((t) => {
        const s = t.symbol.toUpperCase();
        const b = baseAsset(s);
        return s.includes(trimmed) || b.startsWith(trimmed);
      })
      .slice(0, 6);
  }, [q, tickers]);

  const go = (sym: string) => {
    setQ("");
    setFocused(false);
    setLocation(`/trade/${encodeSymbol(sym)}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matches.length > 0) go(matches[0].symbol);
    else if (q.trim()) setLocation(`/markets`);
  };

  return (
    <form onSubmit={onSubmit} className="relative max-w-md" autoComplete="off">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search markets — try BTC, SOL, ZBX…"
          className="pl-10 pr-20 h-12 bg-card/70 backdrop-blur border-border/60 focus:border-primary/60"
          aria-label="Search markets"
        />
        <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          ↵ Enter
        </kbd>
      </div>
      {focused && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {matches.map((t) => {
            const positive = t.priceChangePercent >= 0;
            return (
              <button
                key={t.symbol}
                type="button"
                onMouseDown={() => go(t.symbol)}
                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
              >
                <AssetIcon symbol={t.symbol} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{t.symbol}</div>
                  <div className="text-[11px] text-muted-foreground">{baseAsset(t.symbol)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">{fmtPrice(t.lastPrice, t.symbol)}</div>
                  <div className={`text-[11px] ${positive ? "text-success" : "text-destructive"}`}>
                    {positive ? "+" : ""}
                    {t.priceChangePercent.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// Earn / Staking section
// ──────────────────────────────────────────────────────────────────
function EarnSection() {
  const products = [
    {
      icon: <PiggyBank className="h-6 w-6" />,
      title: "USDT Flexible Savings",
      apy: "5.00",
      coin: "USDT",
      dur: "Flexible",
      desc: "Earn daily interest on idle USDT. No lock-up — withdraw anytime.",
      tag: "Flexible",
      tagColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      grad: "from-emerald-500/20 to-teal-500/5",
      accent: "text-emerald-400",
    },
    {
      icon: <Lock className="h-6 w-6" />,
      title: "USDT 30-Day Locked",
      apy: "8.50",
      coin: "USDT",
      dur: "30 days",
      desc: "30-day USDT locked plan at enhanced APY. Auto-maturity available.",
      tag: "Locked",
      tagColor: "bg-amber-500/15 text-amber-400 border-amber-500/25",
      grad: "from-amber-500/20 to-orange-500/5",
      accent: "text-amber-400",
    },
    {
      icon: <Star className="h-6 w-6" />,
      title: "USDT 90-Day Premium",
      apy: "11.00",
      coin: "USDT",
      dur: "90 days",
      desc: "Best USDT APY. 90-day lock with daily accrual and optional auto-renew.",
      tag: "Best APY",
      tagColor: "bg-primary/15 text-primary border-primary/25",
      grad: "from-primary/20 to-amber-600/5",
      accent: "text-primary",
    },
    {
      icon: <Coins className="h-6 w-6" />,
      title: "BTC Flexible Savings",
      apy: "2.50",
      coin: "BTC",
      dur: "Flexible",
      desc: "Stack more BTC on idle holdings. No lock-up, flexible exit anytime.",
      tag: "Flexible",
      tagColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      grad: "from-orange-500/20 to-amber-500/5",
      accent: "text-orange-400",
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "ETH 60-Day Locked",
      apy: "4.50",
      coin: "ETH",
      dur: "60 days",
      desc: "60-day ETH locked staking with competitive APY and auto-maturity support.",
      tag: "Locked",
      tagColor: "bg-violet-500/15 text-violet-400 border-violet-500/25",
      grad: "from-violet-500/20 to-blue-500/5",
      accent: "text-violet-400",
    },
    {
      icon: <Gem className="h-6 w-6" />,
      title: "BTC 90-Day Premium",
      apy: "7.50",
      coin: "BTC",
      dur: "90 days",
      desc: "High-yield 90-day BTC locked vault. Premium returns for long-term holders. Auto-maturity & daily accrual.",
      tag: "Premium",
      tagColor: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25",
      grad: "from-fuchsia-500/20 to-pink-500/5",
      accent: "text-fuchsia-400",
    },
  ];
  return (
    <section className="w-full py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <Badge variant="outline" className="border-primary/40 text-primary mb-3">
            <Sparkles className="h-3 w-3 mr-1.5" />
            Earn
          </Badge>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Put your assets to work</h2>
          <p className="text-muted-foreground text-sm mt-2">
            6 curated products for USDT, ETH &amp; BTC — flexible or locked, interest accrues every block.
          </p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((p, i) => (
            <Reveal key={p.title} direction="scale" delay={i * 80}>
              <Link href="/earn" className="group block h-full">
                <Card className="relative overflow-hidden p-6 h-full border-border/60 hover:border-primary/40 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10">
                  <div className={`absolute inset-0 bg-gradient-to-br ${p.grad} opacity-60 pointer-events-none`} />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`h-11 w-11 rounded-xl bg-primary/15 ${p.accent} flex items-center justify-center flex-shrink-0`}>{p.icon}</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.tagColor}`}>{p.tag}</span>
                    </div>
                    {/* APY highlight */}
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className={`text-xl sm:text-2xl lg:text-3xl font-extrabold tabular-nums ${p.accent}`}>{p.apy}%</span>
                      <span className="text-xs text-muted-foreground font-medium">APY</span>
                      <span className="ml-auto text-xs font-semibold text-foreground/70 bg-muted/40 px-2 py-0.5 rounded-full">{p.coin}</span>
                    </div>
                    <h3 className="text-base font-bold mt-2">{p.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{p.desc}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{p.dur}</span>
                      <span className="inline-flex items-center text-xs font-medium text-primary group-hover:gap-1.5 gap-1 transition-all">
                        Subscribe <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8 text-center">
          <Link href="/earn" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            View all plans &amp; subscribe <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Developer / API section
// ──────────────────────────────────────────────────────────────────
function DeveloperSection() {
  const [copied, setCopied] = useState(false);
  const snippet = `// JavaScript — connect to Zebvix Blockchain
// Mainnet: chain ID ${ZBX_CHAIN.id} (${ZBX_CHAIN.hexId})
// Testnet: chain ID ${ZBX_TESTNET.id} (${ZBX_TESTNET.hexId})
const res = await fetch("https://rpc.zebvix.io", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_chainId", params: []
  }),
});
const { result } = await res.json();
// result will be "${ZBX_CHAIN.hexId}" → ${ZBX_CHAIN.id} (${ZBX_CHAIN.name})`;

  const copy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(snippet).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="relative w-full py-16 overflow-hidden bg-background">
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative container mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center">
        <Reveal className="space-y-5">
          <Badge variant="outline" className="border-sky-400/40 text-sky-300 bg-sky-500/10">
            <Terminal className="h-3 w-3 mr-1.5" />
            For developers
          </Badge>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
            Build on the{" "}
            <span className="bg-gradient-to-r from-sky-300 to-cyan-400 bg-clip-text text-transparent">Zebvix Blockchain</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            The Zebvix Blockchain speaks JSON-RPC and the standard EVM ABI — your existing tooling (ethers, viem,
            web3.js, hardhat, foundry) works out of the box. Connect your wallet, deploy a contract, and you&apos;re live on
            chain {ZBX_CHAIN.id}.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <DevFeature icon={<Database className="h-4 w-4" />} title="JSON-RPC + WebSocket" desc="Mainnet endpoints with archive node access." />
            <DevFeature icon={<Code2 className="h-4 w-4" />} title="EVM-compatible" desc="Solidity, Vyper and full ZBX-20 support." />
            <DevFeature icon={<BookOpen className="h-4 w-4" />} title="REST &amp; WS exchange API" desc="Same API the web &amp; mobile apps use." />
            <DevFeature icon={<Shield className="h-4 w-4" />} title="Testnet + faucet" desc="Free test ZBX for development." />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" className="bg-sky-600 hover:bg-sky-700 text-white" asChild>
              <a href="#" target="_blank" rel="noreferrer noopener">
                Open API docs <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#" target="_blank" rel="noreferrer noopener">
                Get RPC keys
              </a>
            </Button>
          </div>
        </Reveal>

        {/* Code card */}
        <Reveal delay={120}>
        <Card className="relative overflow-hidden border-border/60 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-3 text-xs text-zinc-400 font-mono">chain-id.js</span>
            </div>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </button>
          </div>
          <pre className="p-5 overflow-x-auto text-xs leading-relaxed">
            <code className="font-mono text-slate-200">
              {snippet.split("\n").map((line, i) => {
                const m = line.match(/^(\s*)(\/\/.*)$/);
                if (m) {
                  return (
                    <div key={i}>
                      {m[1]}
                      <span className="text-slate-500">{m[2]}</span>
                    </div>
                  );
                }
                const colored = line
                  .replace(/(".*?")/g, '\u0001$1\u0002')
                  .split(/\u0001|\u0002/)
                  .map((part, j) => {
                    if (part.startsWith('"')) return <span key={j} className="text-emerald-300">{part}</span>;
                    return (
                      <span key={j}>
                        {part.split(/(\bconst\b|\bawait\b|\bfetch\b|\bmethod\b|\basync\b|\.log)/g).map((sub, k) => {
                          if (["const", "await", "async"].includes(sub))
                            return <span key={k} className="text-violet-300">{sub}</span>;
                          if (["fetch", "method"].includes(sub))
                            return <span key={k} className="text-sky-300">{sub}</span>;
                          if (sub === ".log") return <span key={k} className="text-amber-300">{sub}</span>;
                          return <span key={k}>{sub}</span>;
                        })}
                      </span>
                    );
                  });
                return <div key={i}>{colored}</div>;
              })}
            </code>
          </pre>
        </Card>
        </Reveal>
      </div>
    </section>
  );
}

function DevFeature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="h-8 w-8 rounded-md bg-sky-500/15 text-sky-300 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Roadmap timeline
// ──────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────
// Chain Coming Soon
// ──────────────────────────────────────────────────────────────────
function ChainComingSoonSection() {
  const chains = [
    {
      name: "Ethereum",      symbol: "ETH", color: "from-indigo-500 to-blue-600",   glow: "shadow-indigo-500/30",  border: "border-indigo-500/30",  date: "Q3 2026", status: "coming",  feat: "ERC-20 bridge, L2 settlements",         icon: "Ξ",
    },
    {
      name: "BNB Chain",     symbol: "BSC", color: "from-amber-400 to-yellow-500",  glow: "shadow-amber-400/30",   border: "border-amber-400/30",   date: "Q3 2026", status: "coming",  feat: "BEP-20 bridge, low-fee gateway",        icon: "B",
    },
    {
      name: "Polygon",       symbol: "POL", color: "from-violet-500 to-purple-600", glow: "shadow-violet-500/30",  border: "border-violet-500/30",  date: "Q3 2026", status: "coming",  feat: "MATIC bridge, fast finality",           icon: "P",
    },
    {
      name: "Solana",        symbol: "SOL", color: "from-emerald-400 to-teal-500",  glow: "shadow-emerald-400/30", border: "border-emerald-400/30", date: "Q4 2026", status: "planned", feat: "SPL token bridge, sub-second TXs",      icon: "S",
    },
    {
      name: "Arbitrum",      symbol: "ARB", color: "from-sky-400 to-cyan-500",      glow: "shadow-sky-400/30",     border: "border-sky-400/30",     date: "Q4 2026", status: "planned", feat: "Optimistic rollup, low gas fees",       icon: "A",
    },
    {
      name: "Avalanche",     symbol: "AVAX",color: "from-rose-500 to-red-600",      glow: "shadow-rose-500/30",    border: "border-rose-500/30",    date: "Q4 2026", status: "planned", feat: "C-chain bridge, subnets support",       icon: "◈",
    },
  ];

  return (
    <section className="relative w-full py-20 overflow-hidden bg-card/20 border-y border-border">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(139,92,246,0.08),transparent)]" />
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px,hsl(var(--foreground)) 1px,transparent 0)", backgroundSize: "28px 28px" }}
      />
      {/* Orbs */}
      <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl float-slow pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl float-slow-rev pointer-events-none" />

      <div className="relative container mx-auto px-4">
        {/* Header */}
        <Reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-semibold mb-4">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 animate-ping opacity-70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
            </span>
            Multi-Chain Expansion
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
            More chains,{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 bg-clip-text text-transparent">
              coming soon
            </span>
          </h2>
          <p className="text-muted-foreground text-sm mt-3 max-w-xl mx-auto">
            Zebvix is expanding its native bridge to support major EVM and non-EVM chains.
            One exchange. Every chain. Zero friction.
          </p>
        </Reveal>

        {/* Chain cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {chains.map((c, i) => (
            <Reveal key={c.symbol} direction="scale" delay={i * 80}>
              <div className={`group relative rounded-2xl border ${c.border} bg-card/60 p-5 backdrop-blur hover:shadow-xl ${c.glow} transition-all duration-300 hover:-translate-y-1 overflow-hidden`}>
                {/* Gradient glow bg */}
                <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${c.color} opacity-[0.12] blur-2xl group-hover:opacity-[0.22] transition-opacity pointer-events-none`} />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    {/* Icon */}
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${c.color} text-white font-extrabold text-xl flex items-center justify-center shadow-lg`}>
                      {c.icon}
                    </div>
                    {/* Status badge */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      c.status === "coming"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        : "bg-muted/40 border-border text-muted-foreground"
                    }`}>
                      {c.status === "coming" ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Coming {c.date}
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                          Planned {c.date}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-base font-bold text-foreground">{c.name}</h3>
                    <span className="text-[11px] font-mono text-muted-foreground">{c.symbol}</span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{c.feat}</p>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                      <span>Development progress</span>
                      <span className="font-semibold text-foreground/70">{c.status === "coming" ? "72%" : "38%"}</span>
                    </div>
                    <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${c.color} transition-all duration-1000`}
                        style={{ width: c.status === "coming" ? "72%" : "38%" }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground group-hover:text-primary transition-colors font-medium">
                    <Bell className="h-3 w-3" />
                    Get notified when live
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Bottom banner */}
        <Reveal className="mt-10">
          <div className="relative rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-950/50 via-card/80 to-indigo-950/50 p-6 overflow-hidden flex flex-col sm:flex-row items-center gap-5">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_50%,rgba(139,92,246,0.08),transparent)] pointer-events-none" />
            <div className="relative flex-1 text-center sm:text-left">
              <div className="text-sm font-bold text-foreground">Already live: Zebvix L1 ↔ BSC bridge</div>
              <div className="text-xs text-muted-foreground mt-1">Lock &amp; mint between Zebvix Blockchain and BNB Chain with 24/7 attestation and on-chain proofs.</div>
            </div>
            <Link href="/markets" className="relative flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors shadow-lg shadow-violet-900/30">
              Open Bridge <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// AI Trading callout banner
// ──────────────────────────────────────────────────────────────────
function AiTradingBanner() {
  const features = [
    { icon: <Brain className="h-4 w-4" />, label: "Smart signals" },
    { icon: <Zap className="h-4 w-4" />, label: "Auto-execution" },
    { icon: <Shield className="h-4 w-4" />, label: "Risk controls" },
    { icon: <BarChart3 className="h-4 w-4" />, label: "Live PnL" },
  ];
  return (
    <section className="relative w-full py-16 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/50 via-background to-amber-950/30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_80%_50%,rgba(139,92,246,0.12),transparent)]" />
      <div className="absolute -top-20 right-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl float-slow pointer-events-none" />

      <div className="relative container mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center">
        <Reveal className="space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-300 text-xs font-bold">
            <Brain className="h-3.5 w-3.5 text-amber-400" />
            AI-Powered Trading
            <Sparkles className="h-3 w-3" />
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
            Let AI analyse the market<br />
            <span className="bg-gradient-to-r from-violet-400 to-amber-400 bg-clip-text text-transparent">so you never miss a move</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-lg">
            Zebvix AI scans live market data — momentum, volume, range position — and generates
            BUY / SELL / HOLD signals with confidence scores directly inside the trade terminal.
            One tap to apply the suggestion.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-sm font-medium text-violet-300">
                <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center">{f.icon}</div>
                {f.label}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-900/30" asChild>
              <Link href="/trade/BTC_INR">Try AI Trade on BTC <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="border-violet-500/30 text-violet-300 hover:bg-violet-500/10" asChild>
              <Link href="/ai-trading">AI Auto-Trading Plans</Link>
            </Button>
          </div>
        </Reveal>

        {/* AI card visual */}
        <Reveal delay={120}>
          <div className="relative mx-auto max-w-sm">
            <div className="absolute -inset-4 bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-amber-500/10 rounded-3xl blur-2xl" />
            <Card className="relative border-violet-500/30 bg-card/80 backdrop-blur p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-amber-400" />
                <span className="font-bold text-sm bg-gradient-to-r from-violet-400 to-amber-400 bg-clip-text text-transparent">AI Trade Suggestion</span>
                <Badge variant="outline" className="ml-auto text-[9px] border-violet-500/40 text-violet-400">BTC/INR</Badge>
              </div>
              {/* Signal */}
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex flex-col items-center gap-1">
                  <TrendingUp className="h-8 w-8 text-emerald-400" />
                  <span className="text-xl font-black text-emerald-400">BUY</span>
                  <span className="text-[10px] text-muted-foreground">AI Recommendation</span>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                    <div className="text-[10px] text-muted-foreground mb-1">Confidence</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-[81%] rounded-full bg-emerald-500" />
                      </div>
                      <span className="text-xs font-bold">81%</span>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                    <div className="text-[10px] text-muted-foreground mb-1">Risk Level</div>
                    <div className="text-xs font-bold text-emerald-400 flex items-center gap-1"><Shield className="h-3 w-3" /> Low</div>
                  </div>
                </div>
              </div>
              {/* Signals */}
              {["Strong upward momentum +4.2%", "Price near 24h support", "Above-average volume"].map((r) => (
                <div key={r} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <CircleCheck className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  {r}
                </div>
              ))}
              <Button className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold h-10">
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Apply Suggestion
              </Button>
            </Card>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Premium Features mega-grid
// ──────────────────────────────────────────────────────────────────
function PremiumFeaturesSection() {
  const features = [
    { icon: <BarChart3 className="h-5 w-5" />, title: "Spot Trading", desc: "Real-time order book with limit, market & stop-limit orders. 11 pairs live.", accent: "text-amber-400", bg: "bg-amber-500/10", href: "/trade/BTCINR" },
    { icon: <Zap className="h-5 w-5" />, title: "Perpetual Futures", desc: "Up to 100× leverage, isolated/cross margin, real-time PnL. USDT-margined.", accent: "text-violet-400", bg: "bg-violet-500/10", href: "/futures" },
    { icon: <Brain className="h-5 w-5" />, title: "AI Trading", desc: "Smart BUY/SELL/HOLD signals with confidence score. Auto-apply to order form.", accent: "text-fuchsia-400", bg: "bg-fuchsia-500/10", href: "/ai-trading" },
    { icon: <Rocket className="h-5 w-5" />, title: "Copy Trading", desc: "Mirror top traders automatically. Set risk limits and let the pros trade for you.", accent: "text-sky-400", bg: "bg-sky-500/10", href: "/copy-trading" },
    { icon: <Cpu className="h-5 w-5" />, title: "Trading Bots", desc: "Grid, DCA and custom bots. Set-and-forget automation with stop-loss triggers.", accent: "text-emerald-400", bg: "bg-emerald-500/10", href: "/bots" },
    { icon: <Layers className="h-5 w-5" />, title: "Options (Black-Scholes)", desc: "Full options product with greeks, auto-settlement & premium contracts.", accent: "text-orange-400", bg: "bg-orange-500/10", href: "/futures" },
    { icon: <Globe2 className="h-5 w-5" />, title: "Web3 Multi-Chain", desc: "Synthetic on-ledger swaps across 8 chains. BEP-20, ERC-20 and more.", accent: "text-indigo-400", bg: "bg-indigo-500/10", href: "/wallet" },
    { icon: <ArrowLeftRight className="h-5 w-5" />, title: "P2P Trading", desc: "Peer-to-peer INR deals with escrow protection and dispute resolution.", accent: "text-teal-400", bg: "bg-teal-500/10", href: "/p2p" },
    { icon: <PiggyBank className="h-5 w-5" />, title: "Earn & Staking", desc: "6 earn plans — flexible & locked — for USDT, BTC, ETH. Up to 11% APY.", accent: "text-yellow-400", bg: "bg-yellow-500/10", href: "/earn" },
    { icon: <Coins className="h-5 w-5" />, title: "INR Banking", desc: "UPI, IMPS, NEFT & RTGS deposits/withdrawals with instant credits.", accent: "text-rose-400", bg: "bg-rose-500/10", href: "/wallet" },
    { icon: <Network className="h-5 w-5" />, title: "Portfolio Pro", desc: "Advanced portfolio analytics — PnL breakdown, risk heatmap, trade history.", accent: "text-cyan-400", bg: "bg-cyan-500/10", href: "/portfolio-pro" },
    { icon: <Bell className="h-5 w-5" />, title: "Price Alerts", desc: "Set custom price targets — get notified by email or push when triggered.", accent: "text-amber-300", bg: "bg-amber-400/10", href: "/price-alerts" },
  ];

  return (
    <section className="w-full py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <Badge variant="outline" className="border-primary/40 text-primary mb-3">
            <Gem className="h-3 w-3 mr-1.5" />
            All Features
          </Badge>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">Everything a pro trader needs</h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-xl mx-auto">
            12 powerful features — all under one login. Spot, futures, AI, bots, earn, Web3, P2P and more.
          </p>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <Reveal key={f.title} direction="scale" delay={i * 50}>
              <Link href={f.href} className="group block h-full">
                <div className="h-full rounded-xl border border-border/60 hover:border-primary/40 bg-card/60 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
                  <div className={`h-10 w-10 rounded-xl ${f.bg} ${f.accent} flex items-center justify-center mb-3`}>
                    {f.icon}
                  </div>
                  <h3 className="font-bold text-sm text-foreground">{f.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
                  <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${f.accent} group-hover:gap-2 transition-all`}>
                    Explore <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Referral / Invite & Earn banner
// ──────────────────────────────────────────────────────────────────
function ReferralBanner({ user }: { user: any }) {
  return (
    <section className="relative w-full py-14 overflow-hidden border-y border-border">
      <div className="absolute inset-0 bg-gradient-to-r from-amber-950/40 via-background to-emerald-950/30" />
      <div className="absolute -top-20 right-1/3 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl float-slow pointer-events-none" />

      <div className="relative container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Left: copy */}
          <Reveal className="flex-1 space-y-4 text-center lg:text-left">
            <Badge variant="outline" className="border-amber-400/40 text-amber-400 bg-amber-500/5">
              <Gem className="h-3 w-3 mr-1.5" />
              Invite &amp; Earn
            </Badge>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight leading-tight">
              Earn{" "}
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">20% commission</span>{" "}
              on every trade your friends make
            </h2>
            <p className="text-muted-foreground max-w-lg">
              Share your referral link. When your friends trade on Zebvix, you earn 20% of their trading fees —
              forever, with 5-level deep referral chains.
            </p>
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-1">
              <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-900/30" asChild>
                <Link href={user ? "/referrals" : "/signup"}>{user ? "View My Referrals" : "Sign Up & Get Link"} <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </Reveal>

          {/* Right: stats */}
          <Reveal delay={120} className="flex-shrink-0 grid grid-cols-3 gap-4">
            {[
              { label: "Commission rate", value: "20%", desc: "of trading fees", color: "text-amber-400" },
              { label: "Referral levels", value: "5×", desc: "deep chain", color: "text-emerald-400" },
              { label: "Avg. monthly earn", value: "₹8K+", desc: "per active referral", color: "text-violet-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/60 bg-card/60 p-5 text-center min-w-[8rem]">
                <div className={`text-xl sm:text-2xl lg:text-3xl font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-[11px] font-semibold text-foreground mt-1">{s.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Trust / security bar
// ──────────────────────────────────────────────────────────────────
function TrustBar() {
  const badges = [
    { icon: <Shield className="h-4 w-4" />, label: "KYC & AML Compliant", sub: "PMLA 2002 · FIU-IND" },
    { icon: <Lock className="h-4 w-4" />, label: "95% Cold Storage", sub: "HSM-protected vaults" },
    { icon: <Banknote className="h-4 w-4" />, label: "1% TDS Compliant", sub: "Section 194S / Income Tax" },
    { icon: <Activity className="h-4 w-4" />, label: "99.97% Uptime", sub: "Monitored 24/7" },
    { icon: <Headphones className="h-4 w-4" />, label: "24/7 Support", sub: "Real humans, fast response" },
    { icon: <CircleCheck className="h-4 w-4" />, label: "SEBI Aware", sub: "Operating under guidance" },
  ];

  return (
    <div className="w-full border-y border-border/60 bg-card/20 py-5">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-10">
          {badges.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs">
              <div className="h-8 w-8 rounded-full bg-success/10 border border-success/20 text-success flex items-center justify-center flex-shrink-0">
                {b.icon}
              </div>
              <div>
                <div className="font-semibold text-foreground">{b.label}</div>
                <div className="text-muted-foreground">{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoadmapSection() {
  const milestones = [
    {
      quarter: "Q1 2026",
      status: "shipped" as const,
      title: "Mainnet launch",
      items: ["Zebvix L1 mainnet live", "ZBX-20 token factory", "Spot exchange v1"],
    },
    {
      quarter: "Q2 2026",
      status: "current" as const,
      title: "Liquidity expansion",
      items: ["Cross-chain bridge to BSC/EVM", "Pay-ID v2", "Perpetual futures (100×)"],
    },
    {
      quarter: "Q3 2026",
      status: "planned" as const,
      title: "DeFi & mobile",
      items: ["Native AMM v3 + concentrated LP", "Mobile wallet 2.0", "Staking dashboard"],
    },
    {
      quarter: "Q4 2026",
      status: "planned" as const,
      title: "Decentralization",
      items: ["Public validator set", "On-chain governance", "Grants programme"],
    },
  ];
  return (
    <section className="w-full py-16 bg-card/30 border-y border-border">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-10">
          <Badge variant="outline" className="border-primary/40 text-primary mb-3">
            <CalendarDays className="h-3 w-3 mr-1.5" />
            Roadmap
          </Badge>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Where we&apos;re headed</h2>
          <p className="text-muted-foreground text-sm mt-2">
            A focused, public roadmap for Zebvix Exchange and the Zebvix Blockchain.
          </p>
        </Reveal>

        <div className="relative">
          {/* horizontal connector line (desktop) */}
          <div className="hidden lg:block absolute left-0 right-0 top-[3.25rem] h-px bg-gradient-to-r from-transparent via-border to-transparent draw-line" />
          <div className="grid lg:grid-cols-4 gap-5">
            {milestones.map((m, i) => {
              const Icon =
                m.status === "shipped" ? CircleCheck : m.status === "current" ? CircleDot : Circle;
              const iconColor =
                m.status === "shipped"
                  ? "text-success bg-success/15 border-success/40"
                  : m.status === "current"
                  ? "text-primary bg-primary/15 border-primary/40 animate-pulse"
                  : "text-muted-foreground bg-muted/40 border-border";
              const badgeText =
                m.status === "shipped" ? "Shipped" : m.status === "current" ? "In progress" : "Planned";
              const badgeStyle =
                m.status === "shipped"
                  ? "bg-success/15 text-success border-success/30"
                  : m.status === "current"
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-muted text-muted-foreground border-border";
              return (
                <Reveal key={m.quarter} className="relative" delay={i * 120}>
                  <div className="flex flex-col items-center lg:items-start">
                    {/* node */}
                    <div className={`relative z-10 h-10 w-10 rounded-full border-2 flex items-center justify-center bg-background ${iconColor}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-4 w-full">
                      <Card className="p-5 border-border/60 hover:border-primary/40 transition-colors h-full">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                            {m.quarter}
                          </span>
                          <Badge className={`${badgeStyle} text-[10px] px-2 py-0`}>{badgeText}</Badge>
                        </div>
                        <h3 className="font-bold mt-2">{m.title}</h3>
                        <ul className="mt-3 space-y-1.5">
                          {m.items.map((it) => (
                            <li key={it} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <span className={`mt-1 h-1 w-1 rounded-full flex-shrink-0 ${m.status === "planned" ? "bg-muted-foreground/40" : "bg-primary"}`} />
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
