import { useParams, useLocation, Link } from "wouter";
import {
  useTicker,
  useTickers,
  useOrderbook,
  useRecentTrades,
  decodeSymbol,
  encodeSymbol,
} from "@/lib/marketSocket";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del, api } from "@/lib/api";
import { useMarketCatalog } from "@/lib/marketCatalog";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import { PriceChart } from "@/components/PriceChart";
import {
  Star,
  ChevronDown,
  Search,
  TrendingUp,
  TrendingDown,
  X,
  Info,
  LayoutGrid,
  LayoutPanelLeft,
  Sparkles,
  Zap,
  Shield,
} from "lucide-react";

const LAYOUT_KEY = "zebvix:futures:layout";
const FAV_KEY = "zebvix:futures:favorites";
type LayoutMode = "simple" | "advanced" | "pro";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function baseAsset(sym: string) { return sym.split("/")[0] || sym; }
function quoteAsset(sym: string) { return sym.split("/")[1] || ""; }
function fmtNum(n: number, digits = 2): string {
  if (!isFinite(n) || n === 0) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPrice(n: number, quote: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr = quote === "INR";
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  const prefix = inr ? "₹" : "";
  const suffix = !inr && quote ? ` ${quote}` : "";
  return prefix + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}
function fmtCompact(n: number, prefix = "") {
  if (!isFinite(n) || n === 0) return prefix + "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setFavs(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((sym: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      try { window.localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { favs, toggle };
}

function useFlashOnChange(value: number) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number>(value);
  useEffect(() => {
    if (value === prev.current || prev.current === 0) { prev.current = value; return; }
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = window.setTimeout(() => setFlash(null), 450);
    return () => window.clearTimeout(t);
  }, [value]);
  return flash;
}

// ──────────────────────────────────────────────────────────────────
// Asset icon
// ──────────────────────────────────────────────────────────────────
function AssetIcon({ symbol, size = 9 }: { symbol: string; size?: 6 | 7 | 8 | 9 | 10 }) {
  const b = baseAsset(symbol);
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
  const grad = palette[hashStr(b) % palette.length];
  const dim =
    size === 6 ? "h-6 w-6 text-[10px]"
    : size === 7 ? "h-7 w-7 text-[11px]"
    : size === 8 ? "h-8 w-8 text-xs"
    : size === 10 ? "h-10 w-10 text-sm"
    : "h-9 w-9 text-sm";
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br ${grad} text-white flex items-center justify-center font-bold shadow-md flex-shrink-0`}>
      {b.slice(0, 1)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Symbol switcher — perpetuals only (USDT-quoted markets)
// ──────────────────────────────────────────────────────────────────
function SymbolSwitcher({ current, enabled }: { current: string; enabled: Set<string> }) {
  const tickers = useTickers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { favs } = useFavorites();

  const list = useMemo(() => {
    const all = Object.values(tickers)
      .filter((t) => t.symbol.endsWith("/USDT") && enabled.has(t.symbol))
      .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return all;
    return all.filter((t) => t.symbol.toLowerCase().includes(trimmed));
  }, [tickers, search, enabled]);

  const favList = useMemo(() => list.filter((t) => favs.has(t.symbol)), [list, favs]);
  const otherList = useMemo(() => list.filter((t) => !favs.has(t.symbol)), [list, favs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 hover:bg-muted/40 rounded-md px-2 py-1 transition-colors group"
        >
          <AssetIcon symbol={current} />
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-extrabold leading-none tracking-tight">{baseAsset(current)}</span>
              <span className="text-xs text-muted-foreground leading-none">/{quoteAsset(current)}</span>
              <Badge className="h-4 px-1.5 text-[9px] bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">PERP</Badge>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">USD-M Perpetual · Click to switch</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-80 p-0">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PERP market…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          {favList.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/20">Favorites</div>
              {favList.map((t) => (
                <SwitcherRow key={`fav-${t.symbol}`} t={t} active={t.symbol === current} onPick={() => { setOpen(false); navigate(`/futures/${encodeSymbol(t.symbol)}`); }} />
              ))}
            </div>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/20">All perpetuals</div>
          {otherList.map((t) => (
            <SwitcherRow key={t.symbol} t={t} active={t.symbol === current} onPick={() => { setOpen(false); navigate(`/futures/${encodeSymbol(t.symbol)}`); }} />
          ))}
          {list.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {enabled.size === 0
                ? "No futures markets are enabled yet. Markets will appear here once an admin activates a pair."
                : "No matches."}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwitcherRow({ t, active, onPick }: { t: { symbol: string; lastPrice: number; priceChangePercent: number }; active: boolean; onPick: () => void }) {
  const positive = t.priceChangePercent >= 0;
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-left transition-colors ${active ? "bg-primary/10" : ""}`}
    >
      <AssetIcon symbol={t.symbol} size={7} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">
          {baseAsset(t.symbol)}<span className="text-[10px] text-muted-foreground font-normal">/{quoteAsset(t.symbol)} PERP</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-mono">{fmtPrice(t.lastPrice, quoteAsset(t.symbol))}</div>
        <div className={`text-[10px] font-bold ${positive ? "text-success" : "text-destructive"}`}>
          {positive ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
        </div>
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// Header stat
// ──────────────────────────────────────────────────────────────────
function HeaderStat({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col leading-tight flex-shrink-0 ${className}`}>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="font-mono tabular-nums text-xs sm:text-sm">{children}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main Futures page
// ──────────────────────────────────────────────────────────────────
type OrderType = "limit" | "market";
type Side = "long" | "short";
type MarginType = "isolated" | "cross";

const LEVERAGES = [1, 2, 5, 10, 20, 25, 50, 75, 100];
const FEE_TAKER = 0.0006;  // 0.06% futures taker
const FEE_MAKER = 0.0002;  // 0.02% futures maker

export default function Futures() {
  const params = useParams<{ symbol?: string }>();
  const symbol = decodeSymbol(params.symbol || "BTC_USDT");
  const [base, quote = "USDT"] = symbol.split("/");
  const ticker = useTicker(symbol);
  const orderbook = useOrderbook(symbol, 25);
  const trades = useRecentTrades(symbol, 30);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { favs, toggle: toggleFav } = useFavorites();
  const isFav = favs.has(symbol);

  const [side, setSide] = useState<Side>("long");
  const [type, setType] = useState<OrderType>("limit");
  const [marginType, setMarginType] = useState<MarginType>("isolated");
  const [leverage, setLeverage] = useState(10);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [pctSlider, setPctSlider] = useState<number[]>([0]);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [bottomTab, setBottomTab] = useState<"positions" | "open" | "history">("positions");

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const v = window.localStorage.getItem(LAYOUT_KEY);
      if (v === "simple" || v === "advanced" || v === "pro") return v;
    } catch { /* ignore */ }
    return "advanced";
  });
  useEffect(() => {
    try { window.localStorage.setItem(LAYOUT_KEY, layoutMode); } catch { /* ignore */ }
  }, [layoutMode]);
  const isSimple = layoutMode === "simple";
  const isPro = layoutMode === "pro";
  const bookRows = isPro ? 16 : 12;

  // Futures-enabled symbols (admin-controlled). If the current symbol
  // isn't in this set, show a banner + disable the order form so users
  // can't fire orders the API will reject with 400.
  const { futures: enabledFuturesSet, isLoading: enabledLoading } = useMarketCatalog();
  const symbolEnabled = enabledFuturesSet.has(symbol);
  const noFuturesEnabled = !enabledLoading && enabledFuturesSet.size === 0;

  const lastPx = ticker?.lastPrice || 0;
  const pct = ticker?.priceChangePercent || 0;
  const high = ticker?.high || 0;
  const low = ticker?.low || 0;
  const vol = ticker?.volume || 0;
  const quoteVol = ticker?.quoteVolume || 0;
  const flash = useFlashOnChange(lastPx);

  // ─── Wallet / collateral ─────────────────────
  const { data: walletData } = useQuery<any>({
    queryKey: ["wallet"],
    queryFn: () => get("/finance/wallet"),
    enabled: !!user,
    refetchInterval: 8000,
  });
  const wallets: any[] = useMemo(() => {
    if (!walletData) return [];
    if (Array.isArray(walletData)) return walletData;
    if (Array.isArray(walletData.items)) return walletData.items;
    if (Array.isArray(walletData.wallets)) return walletData.wallets;
    return [];
  }, [walletData]);
  const collateralWallet = wallets.find((w) => (w.currency || w.symbol || w.coin) === quote);
  const collateral = collateralWallet
    ? collateralWallet.available != null
      ? Number(collateralWallet.available)
      : collateralWallet.free != null
        ? Number(collateralWallet.free)
        : Math.max(0, Number(collateralWallet.balance ?? 0) - Number(collateralWallet.inOrder ?? collateralWallet.locked ?? 0))
    : 0;

  // ─── Positions (this symbol) ─────────────────
  // NOTE: no silent .catch fallback — react-query surfaces error state so the
  // bottom panel can warn the user instead of showing a misleading empty list.
  const positionsQuery = useQuery<any>({
    queryKey: ["futures", "positions", base, quote],
    queryFn: () => get(`/futures/position?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}`),
    enabled: !!user,
    refetchInterval: 4000,
  });
  const positions: any[] = useMemo(() => {
    const d = positionsQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.positions)) return d.positions;
    return [];
  }, [positionsQuery.data]);

  // ─── Orders for this symbol ──────────────────
  const openOrdersQuery = useQuery<any>({
    queryKey: ["futures", "orders", "open", base, quote],
    queryFn: () => get(`/futures/order?status=OPEN&currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}`),
    enabled: !!user,
    refetchInterval: 5000,
  });
  const openOrderRows: any[] = useMemo(() => {
    const d = openOrdersQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.items)) return d.items;
    return [];
  }, [openOrdersQuery.data]);

  const historyQuery = useQuery<any>({
    queryKey: ["futures", "orders", "history", base, quote, bottomTab],
    queryFn: () => get(`/futures/order?currency=${encodeURIComponent(base)}&pair=${encodeURIComponent(quote)}&limit=30`),
    enabled: !!user && bottomTab === "history",
    refetchInterval: 15000,
  });
  const historyRows: any[] = useMemo(() => {
    const d = historyQuery.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.items)) return d.items;
    return [];
  }, [historyQuery.data]);

  // ─── Mutations ───────────────────────────────
  const apiSide = side === "long" ? "buy" : "sell";

  const orderMutation = useMutation({
    mutationFn: (data: any) => post("/futures/order", data),
    onSuccess: () => {
      toast.success(`${side === "long" ? "Long" : "Short"} ${leverage}× ${type === "market" ? "market " : ""}position queued`);
      setPrice("");
      setAmount("");
      setPctSlider([0]);
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to place order"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string | number) => del(`/futures/order/${id}`),
    onSuccess: () => {
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Cancel failed"),
  });

  const cancelAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(openOrderRows.map((o) => del(`/futures/order/${o.id}`).catch(() => null)));
    },
    onSuccess: () => {
      toast.success("All orders cancelled");
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (pos: any) => api(`/futures/position`, {
      method: "DELETE",
      body: JSON.stringify({
        currency: pos.currency || base,
        pair: pos.pair || quote,
        side: String(pos.side || "long").toLowerCase(),
      }),
    }),
    onSuccess: () => {
      toast.success("Position closed at market");
      qc.invalidateQueries({ queryKey: ["futures"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => toast.error(err?.message || "Close failed"),
  });

  const leverageMutation = useMutation({
    mutationFn: (lv: number) => post("/futures/leverage", { currency: base, pair: quote, leverage: lv }),
    onSuccess: (_d: any, lv: number) => toast.success(`Leverage set to ${lv}×`),
    onError: (err: any) => toast.error(err?.message || "Leverage update failed"),
  });

  // ─── Order entry math ────────────────────────
  const refPrice = type === "limit" ? Number(price || 0) : lastPx;
  const amt = Number(amount || 0);
  const notional = amt * refPrice;
  const margin = notional / Math.max(leverage, 1);
  const feeTaker = notional * FEE_TAKER;
  const feeMaker = notional * FEE_MAKER;
  // Approx liquidation price for cross/isolated isolated PERP (mm 0.5%):
  // long:  liq ≈ entry × (1 − 1/lev + mm)
  // short: liq ≈ entry × (1 + 1/lev − mm)
  const MM_RATE = 0.005;
  const liqPrice = refPrice > 0
    ? side === "long"
      ? refPrice * (1 - 1 / leverage + MM_RATE)
      : refPrice * (1 + 1 / leverage - MM_RATE)
    : 0;

  // ─── Slider → amount (uses leveraged buying power) ───
  const buyingPower = collateral * leverage;
  const onSliderChange = (v: number[]) => {
    setPctSlider(v);
    if (!(refPrice > 0)) return;
    const px = refPrice;
    const tgtNotional = (buyingPower * v[0]) / 100;
    const tgtAmt = tgtNotional / px;
    setAmount(tgtAmt > 0 ? tgtAmt.toFixed(6) : "");
  };

  const handleOrder = () => {
    if (!user) { toast.error("Please log in"); return; }
    if (!(amt > 0)) { toast.error("Enter a size"); return; }
    if (type === "limit" && !(Number(price) > 0)) { toast.error("Enter a price"); return; }
    if (margin > collateral + 1e-9) { toast.error("Insufficient margin"); return; }
    orderMutation.mutate({
      currency: base,
      pair: quote,
      side: apiSide,
      type,
      amount: amt,
      price: type === "limit" ? Number(price) : undefined,
      leverage,
      reduceOnly: reduceOnly || undefined,
      stopLossPrice: slEnabled && Number(slPrice) > 0 ? Number(slPrice) : undefined,
      takeProfitPrice: tpEnabled && Number(tpPrice) > 0 ? Number(tpPrice) : undefined,
    });
  };

  // ─── Orderbook math ──────────────────────────
  const bestBid = orderbook.bids[0]?.[0] || 0;
  const bestAsk = orderbook.asks[0]?.[0] || 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  const maxBidQty = Math.max(1, ...orderbook.bids.slice(0, bookRows).map(([, q]) => q));
  const maxAskQty = Math.max(1, ...orderbook.asks.slice(0, bookRows).map(([, q]) => q));

  // Total unrealised PnL across positions (this symbol)
  const totalUpnl = positions.reduce((s, p) => s + Number(p.unrealisedPnl ?? p.unrealizedPnl ?? 0), 0);
  const totalMargin = positions.reduce((s, p) => s + Number(p.margin ?? 0), 0);

  // ─── Bottom panel JSX (used twice — desktop inside chart column, mobile standalone) ───
  const bottomPanelJsx = (
    <Tabs value={bottomTab} onValueChange={(v) => setBottomTab(v as any)} className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 border-b border-border">
        <TabsList className="bg-transparent h-9 p-0 gap-1">
          <TabsTrigger value="positions" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Positions <span className="ml-1.5 text-[10px] text-muted-foreground">({positions.length})</span>
          </TabsTrigger>
          <TabsTrigger value="open" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Open Orders <span className="ml-1.5 text-[10px] text-muted-foreground">({openOrderRows.length})</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-9 px-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none">
            Order History
          </TabsTrigger>
        </TabsList>
        {bottomTab === "open" && openOrderRows.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => cancelAllMutation.mutate()}
            disabled={cancelAllMutation.isPending}
          >
            Cancel all
          </Button>
        )}
      </div>
      <TabsContent value="positions" className="flex-1 m-0 overflow-auto">
        <PositionsTable
          rows={positions}
          loggedOut={!user}
          isError={positionsQuery.isError}
          isFetching={positionsQuery.isFetching && !positionsQuery.data}
          onRetry={() => positionsQuery.refetch()}
          mark={lastPx}
          onClose={(p) => closeMutation.mutate(p)}
          closingId={closeMutation.variables?.id as any}
        />
      </TabsContent>
      <TabsContent value="open" className="flex-1 m-0 overflow-auto">
        <OrdersTable
          rows={openOrderRows}
          loggedOut={!user}
          isError={openOrdersQuery.isError}
          isFetching={openOrdersQuery.isFetching && !openOrdersQuery.data}
          onRetry={() => openOrdersQuery.refetch()}
          mode="open"
          onCancel={(id) => cancelMutation.mutate(id)}
          cancelingId={cancelMutation.variables as any}
        />
      </TabsContent>
      <TabsContent value="history" className="flex-1 m-0 overflow-auto">
        <OrdersTable
          rows={historyRows}
          loggedOut={!user}
          isError={historyQuery.isError}
          isFetching={historyQuery.isFetching && !historyQuery.data}
          onRetry={() => historyQuery.refetch()}
          mode="history"
        />
      </TabsContent>
    </Tabs>
  );

  if (user && (user.kycLevel ?? 0) < 2) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        <KycGate requiredLevel={2} feature="Futures Trading" mode="page" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-[calc(100vh-56px)] lg:h-[calc(100vh-56px)] bg-background">
      {/* ── Header strip ───────────────────────────────── */}
      <div className="border-b border-border bg-card/60 backdrop-blur shrink-0">
        <div className="flex items-center px-2 sm:px-4 gap-2 sm:gap-5 h-16 overflow-x-auto">
          <button
            type="button"
            onClick={() => toggleFav(symbol)}
            className={`p-1.5 rounded hover:bg-muted/40 transition flex-shrink-0 ${isFav ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"}`}
            aria-label={isFav ? "Unfavorite" : "Favorite"}
          >
            <Star className={`h-4 w-4 ${isFav ? "fill-amber-400" : ""}`} />
          </button>

          <SymbolSwitcher current={symbol} enabled={enabledFuturesSet} />

          {/* Spot / Futures mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-md border border-border flex-shrink-0">
            <Link href={`/trade`} className="px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-sm transition-colors">Spot</Link>
            <span className="px-3 py-1 text-[11px] font-bold rounded-sm bg-card text-foreground shadow-sm">Futures</span>
          </div>

          <div className="h-10 w-px bg-border flex-shrink-0" />

          <HeaderStat label="Mark Price">
            <span className={`font-bold text-base sm:text-lg transition-colors ${
              flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : pct >= 0 ? "text-success" : "text-destructive"
            }`}>
              {fmtPrice(lastPx, quote)}
            </span>
          </HeaderStat>

          <HeaderStat label="24h Change">
            <span className={pct >= 0 ? "text-success" : "text-destructive"}>
              {pct >= 0 ? "+" : ""}{fmtNum(pct, 2)}%
            </span>
          </HeaderStat>

          <HeaderStat label="24h High">{fmtPrice(high, quote)}</HeaderStat>
          <HeaderStat label="24h Low">{fmtPrice(low, quote)}</HeaderStat>
          <HeaderStat label={`24h Vol (${base})`}>{fmtCompact(vol)}</HeaderStat>
          <HeaderStat label={`24h Vol (${quote})`}>{fmtCompact(quoteVol, quote === "INR" ? "₹" : "")}{quote !== "INR" && quote ? ` ${quote}` : ""}</HeaderStat>

          {!isSimple && (
            <HeaderStat label="Funding · Next">
              <span className="text-muted-foreground">— · 8h</span>
            </HeaderStat>
          )}

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted-foreground font-medium">View</span>
            <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
              <button
                onClick={() => setLayoutMode("simple")}
                className={`px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 transition ${isSimple ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"}`}
              >
                <LayoutPanelLeft className="h-3 w-3" /> Simple
              </button>
              <button
                onClick={() => setLayoutMode("advanced")}
                className={`px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 transition border-l border-border ${layoutMode === "advanced" ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"}`}
              >
                <LayoutGrid className="h-3 w-3" /> Advanced
              </button>
              <button
                onClick={() => setLayoutMode("pro")}
                className={`px-2.5 py-1.5 text-[11px] font-medium flex items-center gap-1 transition border-l border-border ${isPro ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"}`}
              >
                <Sparkles className="h-3 w-3" /> Pro
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
        {/* Orderbook + Recent Trades — LEFT column on desktop */}
        {!isSimple && (
        <div className={`order-3 lg:order-1 w-full ${isPro ? "lg:w-72" : "lg:w-64"} flex flex-col bg-card/40 shrink-0 border-t lg:border-t-0 lg:border-r border-border h-[44vh] lg:h-auto`}>
          <div className="flex flex-row lg:flex-col h-full min-h-0">
          {/* Orderbook */}
          <div className="w-1/2 lg:w-full lg:h-1/2 flex flex-col border-r lg:border-r-0 lg:border-b border-border min-h-0">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Order Book</span>
              {isPro && spread > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  Spread <span className="text-foreground font-mono">{fmtPrice(spread, quote)}</span>
                  <span className="ml-1 text-muted-foreground">({spreadPct.toFixed(3)}%)</span>
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto px-2 py-1 text-xs font-mono">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground py-1 px-1 sticky top-0 bg-card/40 backdrop-blur z-10">
                <span>Price ({quote})</span>
                <span className="text-right">Size ({base})</span>
                <span className="text-right">Total</span>
              </div>
              {orderbook.asks.slice(0, bookRows).reverse().map(([px, qty], i) => {
                const cumulative = orderbook.asks.slice(0, bookRows - i).reduce((s, [, q]) => s + q, 0);
                return (
                  <button
                    key={`ask-${i}`}
                    type="button"
                    onClick={() => setPrice(String(px))}
                    className="relative grid grid-cols-3 py-[2px] px-1 hover:bg-destructive/5 w-full text-left"
                  >
                    <div className="absolute right-0 top-0 bottom-0 bg-destructive/10" style={{ width: `${(qty / maxAskQty) * 100}%` }} />
                    <span className="relative text-destructive tabular-nums">{fmtNum(px, quote === "INR" ? 2 : 4)}</span>
                    <span className="relative text-right tabular-nums">{fmtNum(qty, 4)}</span>
                    <span className="relative text-right tabular-nums text-muted-foreground">{fmtCompact(cumulative)}</span>
                  </button>
                );
              })}
              <div className={`py-2 my-1 text-center text-base font-bold border-y border-border tabular-nums ${pct >= 0 ? "text-success" : "text-destructive"}`}>
                {fmtPrice(lastPx, quote)}
              </div>
              {orderbook.bids.slice(0, bookRows).map(([px, qty], i) => {
                const cumulative = orderbook.bids.slice(0, i + 1).reduce((s, [, q]) => s + q, 0);
                return (
                  <button
                    key={`bid-${i}`}
                    type="button"
                    onClick={() => setPrice(String(px))}
                    className="relative grid grid-cols-3 py-[2px] px-1 hover:bg-success/5 w-full text-left"
                  >
                    <div className="absolute right-0 top-0 bottom-0 bg-success/10" style={{ width: `${(qty / maxBidQty) * 100}%` }} />
                    <span className="relative text-success tabular-nums">{fmtNum(px, quote === "INR" ? 2 : 4)}</span>
                    <span className="relative text-right tabular-nums">{fmtNum(qty, 4)}</span>
                    <span className="relative text-right tabular-nums text-muted-foreground">{fmtCompact(cumulative)}</span>
                  </button>
                );
              })}
              {orderbook.bids.length === 0 && orderbook.asks.length === 0 && (
                <div className="py-6 text-center text-muted-foreground text-xs">No depth yet</div>
              )}
            </div>
          </div>
          {/* Recent trades */}
          <div className="w-1/2 lg:w-full lg:h-1/2 flex flex-col min-h-0">
            <div className="px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">Recent Trades</span>
              <span className="text-[10px] text-muted-foreground">{trades.length} prints</span>
            </div>
            <div className="flex-1 overflow-auto px-2 py-1 text-xs font-mono">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground py-1 px-1 sticky top-0 bg-card/40 backdrop-blur z-10">
                <span>Price ({quote})</span>
                <span className="text-right">Size ({base})</span>
                <span className="text-right">Time</span>
              </div>
              {trades.map((t, i) => (
                <div key={i} className="grid grid-cols-3 py-[2px] px-1">
                  <span className={`tabular-nums ${t.side === "buy" ? "text-success" : "text-destructive"}`}>{fmtNum(t.price, quote === "INR" ? 2 : 4)}</span>
                  <span className="text-right tabular-nums">{fmtNum(t.qty, 4)}</span>
                  <span className="text-right text-muted-foreground">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
                </div>
              ))}
              {trades.length === 0 && <div className="py-6 text-center text-muted-foreground text-xs">No trades yet</div>}
            </div>
          </div>
          </div>
        </div>
        )}

        {/* Chart + bottom panel — CENTER column on desktop */}
        <div className="flex flex-col min-w-0 order-1 lg:order-2 lg:flex-1 lg:border-r lg:border-border">
          <div className={`h-[42vh] sm:h-[48vh] lg:h-auto lg:flex-1 lg:min-h-0 lg:min-w-0 ${isSimple ? "lg:max-h-[68vh]" : ""}`}>
            <PriceChart symbol={symbol} />
          </div>

          {!isSimple && (
            <div className={`hidden lg:flex border-t border-border bg-card/60 ${isPro ? "h-60" : "h-56"} flex-col shrink-0`}>
              {bottomPanelJsx}
            </div>
          )}
        </div>

        {/* ── Order Entry ── */}
        <div className={`order-2 lg:order-3 w-full ${isSimple ? "lg:max-w-sm lg:mx-auto" : "lg:w-[280px]"} bg-card/40 flex flex-col shrink-0 lg:overflow-y-auto border-t lg:border-t-0 border-border`}>
          <div className="p-3 sm:p-4 space-y-3">
            {/* Margin type + leverage */}
            {!isSimple && (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1 py-1.5 rounded border border-border bg-muted/30 hover:bg-muted/50 font-medium"
                    >
                      <Shield className="h-3 w-3" />
                      {marginType === "isolated" ? "Isolated" : "Cross"}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Margin Mode</div>
                    {(["isolated", "cross"] as MarginType[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMarginType(m)}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/40 ${marginType === m ? "bg-primary/10 text-primary font-semibold" : ""}`}
                      >
                        {m === "isolated" ? "Isolated · Per-position margin" : "Cross · Shared margin (coming soon)"}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1 py-1.5 rounded border border-border bg-muted/30 hover:bg-muted/50 font-bold text-primary"
                    >
                      <Zap className="h-3 w-3" />
                      {leverage}×
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Adjust Leverage</span>
                      <span className="text-base font-mono font-bold text-primary">{leverage}×</span>
                    </div>
                    <Slider
                      value={[leverage]}
                      onValueChange={(v) => setLeverage(Math.max(1, Math.min(100, v[0])))}
                      min={1}
                      max={100}
                      step={1}
                    />
                    <div className="grid grid-cols-9 gap-1">
                      {LEVERAGES.map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          onClick={() => setLeverage(lv)}
                          className={`text-[10px] py-1 rounded font-mono ${leverage === lv ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted/60 text-muted-foreground"}`}
                        >
                          {lv}×
                        </button>
                      ))}
                    </div>
                    {user && (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => leverageMutation.mutate(leverage)}
                        disabled={leverageMutation.isPending}
                      >
                        {leverageMutation.isPending ? "Saving…" : "Save as default"}
                      </Button>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Higher leverage means a higher chance of liquidation. Trade carefully.
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Long/Short pill */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted/40 rounded-lg">
              <button
                type="button"
                onClick={() => setSide("long")}
                className={`py-2 rounded-md text-sm font-bold transition-all ${
                  side === "long"
                    ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                Long
              </button>
              <button
                type="button"
                onClick={() => setSide("short")}
                className={`py-2 rounded-md text-sm font-bold transition-all ${
                  side === "short"
                    ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-sm shadow-rose-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingDown className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                Short
              </button>
            </div>

            {/* Order type tabs */}
            <div className="flex gap-1 p-0.5 bg-muted/30 rounded-md text-xs">
              {(["limit", "market"] as OrderType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 rounded font-medium capitalize ${type === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Simple mode leverage row */}
            {isSimple && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Leverage</span>
                <div className="flex items-center gap-1">
                  {[1, 5, 10, 25, 50].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLeverage(lv)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${leverage === lv ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}
                    >
                      {lv}×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price */}
            {type === "limit" && (
              <div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <span>Price</span>
                  <div className="flex gap-1">
                    {bestBid > 0 && <button onClick={() => setPrice(String(bestBid))} className="text-primary normal-case">Bid</button>}
                    {lastPx > 0 && <button onClick={() => setPrice(String(lastPx))} className="text-primary normal-case">Mark</button>}
                    {bestAsk > 0 && <button onClick={() => setPrice(String(bestAsk))} className="text-primary normal-case">Ask</button>}
                  </div>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={lastPx ? fmtNum(lastPx, 2) : "0.00"}
                    className="font-mono pr-14 h-9"
                    step="any"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{quote}</span>
                </div>
              </div>
            )}

            {/* Size */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Size</div>
              <div className="relative">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setPctSlider([0]); }}
                  placeholder="0.00"
                  className="font-mono pr-14 h-9"
                  step="any"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{base}</span>
              </div>
            </div>

            {/* Slider + pct buttons */}
            <div className="space-y-2">
              <Slider value={pctSlider} onValueChange={onSliderChange} max={100} step={1} />
              <div className="grid grid-cols-4 gap-1">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onSliderChange([p])}
                    className="text-[10px] py-1 rounded bg-muted/30 hover:bg-muted/60 text-muted-foreground font-medium"
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {/* TP / SL */}
            {!isSimple && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Switch checked={tpEnabled} onCheckedChange={setTpEnabled} />
                    <span className="text-success font-medium">Take Profit</span>
                  </label>
                  {tpEnabled && (
                    <div className="relative w-32">
                      <Input
                        type="number"
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        placeholder="0.00"
                        className="font-mono h-7 text-xs pr-10"
                        step="any"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{quote}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Switch checked={slEnabled} onCheckedChange={setSlEnabled} />
                    <span className="text-destructive font-medium">Stop Loss</span>
                  </label>
                  {slEnabled && (
                    <div className="relative w-32">
                      <Input
                        type="number"
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        placeholder="0.00"
                        className="font-mono h-7 text-xs pr-10"
                        step="any"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{quote}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reduce-only / Post-only — Post-only currently unsupported by the matching engine, marked as Soon. */}
            {!isSimple && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded border border-border bg-muted/20">
                  <span className="text-muted-foreground">Reduce-only</span>
                  <Switch checked={reduceOnly} onCheckedChange={setReduceOnly} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded border border-border bg-muted/10 opacity-60 cursor-not-allowed" title="Post-only orders coming soon">
                  <span className="text-muted-foreground">Post-only</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-medium">Soon</Badge>
                </label>
              </div>
            )}

            {/* Stats */}
            <div className="space-y-1 text-xs border-t border-border pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="tabular-nums">{fmtNum(collateral, 2)} {quote}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buying Power</span>
                <span className="tabular-nums text-primary">{fmtNum(buyingPower, 2)} {quote}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notional</span>
                <span className="tabular-nums">{fmtNum(notional, 2)} {quote}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Required Margin</span>
                <span className={`tabular-nums ${margin > collateral ? "text-destructive" : ""}`}>{fmtNum(margin, 2)} {quote}</span>
              </div>
              {!isSimple && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Liq. Price (est.)</span>
                    <span className={`tabular-nums ${side === "long" ? "text-destructive" : "text-success"}`}>
                      {liqPrice > 0 ? fmtPrice(liqPrice, quote) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee (taker / maker)</span>
                    <span className="tabular-nums">{fmtNum(feeTaker, 2)} / {fmtNum(feeMaker, 2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Action button */}
            <Button
              className={`w-full font-bold h-10 text-sm shadow-md ${side === "long"
                ? "bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
                : "bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-rose-500/30"
              }`}
              onClick={handleOrder}
              disabled={orderMutation.isPending || !user || !symbolEnabled}
            >
              {!user
                ? "Log in to Trade"
                : !symbolEnabled
                  ? (noFuturesEnabled ? "Futures markets disabled" : `${base}/${quote} futures off`)
                  : orderMutation.isPending
                    ? "Placing…"
                    : `${side === "long" ? "Open Long" : "Open Short"} ${leverage}× ${base}`
              }
            </Button>

            {/* Open positions summary chip */}
            {user && positions.length > 0 && (
              <div className="rounded-md border border-border bg-muted/10 p-2 text-[11px]">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Open positions ({positions.length})</span>
                  <span className={`font-mono font-bold ${totalUpnl >= 0 ? "text-success" : "text-destructive"}`}>
                    {totalUpnl >= 0 ? "+" : ""}{fmtNum(totalUpnl, 2)} {quote}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total margin</span>
                  <span className="tabular-nums">{fmtNum(totalMargin, 2)} {quote}</span>
                </div>
              </div>
            )}

            {/* Pair badge */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground border-t border-border pt-3">
              <Info className="h-3 w-3" />
              <span>USD-M Perpetual · Settled in {quote}</span>
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[9px]">ZBX-PERP</Badge>
            </div>
          </div>
        </div>

        {/* Mobile-only bottom panel (Advanced/Pro). Desktop shows it inside chart column. */}
        {!isSimple && (
          <div className="lg:hidden order-4 border-t border-border bg-card/60 h-[60vh] flex flex-col shrink-0">
            {bottomPanelJsx}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Positions table
// ──────────────────────────────────────────────────────────────────
function PositionsTable({
  rows,
  loggedOut,
  isError,
  isFetching,
  onRetry,
  mark,
  onClose,
  closingId,
}: {
  rows: any[];
  loggedOut: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  mark: number;
  onClose: (p: any) => void;
  closingId?: string | number;
}) {
  if (loggedOut) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        <a href="/login" className="text-primary hover:underline">Log in</a> to see your positions.
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-4 py-6 text-xs text-center space-y-2">
        <div className="text-destructive font-semibold">⚠ Couldn’t load positions.</div>
        <div className="text-muted-foreground">Your live exposure is hidden — please retry before placing new orders.</div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (isFetching && rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground animate-pulse">Loading positions…</div>;
  }
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground">No open positions.</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
          <th className="text-left px-2 py-1.5 font-medium">Side</th>
          <th className="text-right px-2 py-1.5 font-medium">Size</th>
          <th className="text-right px-2 py-1.5 font-medium">Entry</th>
          <th className="text-right px-2 py-1.5 font-medium">Mark</th>
          <th className="text-right px-2 py-1.5 font-medium">Liq.</th>
          <th className="text-right px-2 py-1.5 font-medium">Margin</th>
          <th className="text-right px-2 py-1.5 font-medium">PnL (ROE)</th>
          <th className="text-right px-3 py-1.5 font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p: any) => {
          const sideStr = String(p.side || "long").toLowerCase();
          const entry = Number(p.entryPrice ?? p.openPrice ?? 0);
          const size = Number(p.amount ?? p.size ?? p.qty ?? 0);
          const markPx = Number(p.markPrice ?? mark);
          const lev = Number(p.leverage ?? 1);
          const marginAmt = Number(p.margin ?? (entry * size) / Math.max(lev, 1));
          const liq = Number(p.liquidationPrice ?? 0);
          const pnl = Number(p.unrealisedPnl ?? p.unrealizedPnl ?? p.pnl ?? ((markPx - entry) * size * (sideStr === "long" ? 1 : -1)));
          const roe = marginAmt > 0 ? (pnl / marginAmt) * 100 : 0;
          const sym = String(p.symbol ?? `${p.currency || ""}/${p.pair || ""}`);
          return (
            <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-muted/15">
              <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                {sym}
                <Badge variant="outline" className="ml-1.5 h-3.5 px-1 text-[8px]">{lev}×</Badge>
              </td>
              <td className={`px-2 py-1.5 font-bold ${sideStr === "long" ? "text-success" : "text-destructive"}`}>{sideStr.toUpperCase()}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(size, 4)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(entry, 2)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(markPx, 2)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-amber-400">{liq > 0 ? fmtNum(liq, 2) : "—"}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(marginAmt, 2)}</td>
              <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
                {pnl >= 0 ? "+" : ""}{fmtNum(pnl, 2)}
                <span className="block text-[10px] opacity-75">({pnl >= 0 ? "+" : ""}{roe.toFixed(2)}%)</span>
              </td>
              <td className="px-3 py-1.5 text-right">
                <button
                  className="text-destructive text-xs hover:bg-destructive/10 px-1.5 py-0.5 rounded disabled:opacity-50"
                  onClick={() => onClose({ ...p, side: sideStr })}
                  disabled={closingId === p.id}
                  aria-label="Close position"
                >
                  <X className="h-3 w-3 inline-block" /> Close
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────────────────────────────────────────────────────────────────
// Orders table (open + history)
// ──────────────────────────────────────────────────────────────────
function OrdersTable({
  rows,
  loggedOut,
  isError,
  isFetching,
  onRetry,
  mode,
  onCancel,
  cancelingId,
}: {
  rows: any[];
  loggedOut: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  mode: "open" | "history";
  onCancel?: (id: string | number) => void;
  cancelingId?: string | number;
}) {
  if (loggedOut) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        <a href="/login" className="text-primary hover:underline">Log in</a> to see your orders.
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-4 py-6 text-xs text-center space-y-2">
        <div className="text-destructive font-semibold">
          ⚠ Couldn’t load {mode === "open" ? "open orders" : "order history"}.
        </div>
        {mode === "open" && (
          <div className="text-muted-foreground">Pending orders are hidden — retry before placing new ones.</div>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (isFetching && rows.length === 0) {
    return <div className="px-4 py-6 text-xs text-center text-muted-foreground animate-pulse">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-xs text-center text-muted-foreground">
        {mode === "open" ? "No open orders." : "No order history."}
      </div>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
          <th className="text-left px-2 py-1.5 font-medium">Side</th>
          <th className="text-left px-2 py-1.5 font-medium">Type</th>
          <th className="text-right px-2 py-1.5 font-medium">Price</th>
          <th className="text-right px-2 py-1.5 font-medium">Size</th>
          <th className="text-right px-2 py-1.5 font-medium">Filled</th>
          <th className="text-right px-2 py-1.5 font-medium">Lev.</th>
          {mode === "history" && <th className="text-right px-2 py-1.5 font-medium">Status</th>}
          <th className="text-right px-2 py-1.5 font-medium">Time</th>
          {mode === "open" && <th className="text-right px-3 py-1.5 font-medium">Action</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((o: any) => {
          const sideStr = String(o.side || "BUY").toUpperCase();
          const isLongSide = sideStr === "BUY" || sideStr === "LONG";
          const px = Number(o.price ?? o.priceFilled ?? 0);
          const qty = Number(o.amount ?? o.qty ?? 0);
          const filled = Number(o.filled ?? o.filledQty ?? 0);
          const lev = Number(o.leverage ?? 1);
          const ts = Number(o.createdAt ? new Date(o.createdAt).getTime() : o.ts ?? Date.now());
          const status = String(o.status || "OPEN").toUpperCase();
          const sym = String(o.symbol ?? `${o.currency || ""}/${o.pair || ""}`);
          return (
            <tr key={o.id} className="border-b border-border last:border-b-0 hover:bg-muted/15">
              <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{sym}</td>
              <td className={`px-2 py-1.5 font-bold ${isLongSide ? "text-success" : "text-destructive"}`}>{isLongSide ? "LONG" : "SHORT"}</td>
              <td className="px-2 py-1.5 capitalize text-muted-foreground">{String(o.type || "limit").toLowerCase()}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{px > 0 ? fmtNum(px, 2) : "Market"}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(qty, 4)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtNum(filled, 4)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-primary">{lev}×</td>
              {mode === "history" && (
                <td className="px-2 py-1.5 text-right">
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${
                    status === "FILLED" || status === "CLOSED" ? "border-success/30 text-success bg-success/5"
                    : status === "CANCELLED" || status === "CANCELED" ? "border-muted-foreground/30 text-muted-foreground"
                    : status === "REJECTED" ? "border-destructive/30 text-destructive bg-destructive/5"
                    : "border-amber-500/30 text-amber-400 bg-amber-500/5"
                  }`}>{status}</Badge>
                </td>
              )}
              <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground tabular-nums">
                {new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
              </td>
              {mode === "open" && (
                <td className="px-3 py-1.5 text-right">
                  <button
                    className="text-destructive text-xs hover:bg-destructive/10 px-1.5 py-0.5 rounded"
                    onClick={() => onCancel?.(o.id)}
                    disabled={cancelingId === o.id}
                    aria-label="Cancel order"
                  >
                    <X className="h-3 w-3 inline-block" /> Cancel
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
