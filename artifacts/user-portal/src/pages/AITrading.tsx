import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { toast } from "sonner";
import {
  TrendingUp, Bot, DollarSign, Clock, Shield, Zap, Flame,
  ChevronRight, RefreshCw, BarChart2, Cpu, Target, Sparkles,
  Calendar, ArrowUpRight, CheckCircle2, Activity, Lock,
  Star, Users, Play, Info, Award, Layers, Infinity,
  Receipt, Printer, IndianRupee, XCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
} from "recharts";

interface Plan {
  id: number;
  name: string;
  description?: string;
  dailyReturnPercent: number;
  minInvestment: number;
  maxInvestment: number;
  durationDays: number;
  riskLevel: "low" | "medium" | "high" | "ultra";
  isActive: boolean;
  totalInvestors: number;
}

interface Subscription {
  id: number;
  planId: number;
  planName: string;
  riskLevel: string;
  investedAmount: number;
  currentValue: number;
  startedAt: string;
  expiresAt: string | null;
  noExpire: boolean;
  durationDays: number;
  dailyReturnPercent: number;
  status: "active" | "completed" | "cancelled";
  totalEarned: number;
  dailyReturn: number;
}

interface Earning {
  id: number;
  subscriptionId: number;
  planName: string;
  amountUsdt: number;
  creditedAt: string;
}

const RISK = {
  low: {
    label: "Low Risk", color: "#10b981", glow: "rgba(16,185,129,0.15)",
    bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400",
    gradient: "from-emerald-500/20 to-emerald-600/5",
    icon: <Shield className="w-4 h-4" />,
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  medium: {
    label: "Moderate", color: "#f59e0b", glow: "rgba(245,158,11,0.15)",
    bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400",
    gradient: "from-amber-500/20 to-amber-600/5",
    icon: <TrendingUp className="w-4 h-4" />,
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  high: {
    label: "Aggressive", color: "#f97316", glow: "rgba(249,115,22,0.15)",
    bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400",
    gradient: "from-orange-500/20 to-orange-600/5",
    icon: <Zap className="w-4 h-4" />,
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  ultra: {
    label: "Ultra High", color: "#f43f5e", glow: "rgba(244,63,94,0.15)",
    bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400",
    gradient: "from-rose-500/20 to-rose-600/5",
    icon: <Flame className="w-4 h-4" />,
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
} as const;

type RiskKey = keyof typeof RISK;

function getRisk(key: string) {
  return RISK[(key as RiskKey)] ?? RISK.medium;
}

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

/** Re-render every second so countdown / elapsed timers tick live. */
function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Format a millisecond duration as "2d 04h 12m 30s" (omits leading zero units). */
function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  if (h > 0) return `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  return `${pad(m)}m ${pad(sec)}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtUSD(n: number, dp = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + " USDT";
}

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = ref.current;
    const diff = target - start;
    const steps = 30;
    const stepMs = duration / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const next = start + diff * (i / steps);
      setVal(next);
      if (i >= steps) { setVal(target); ref.current = target; clearInterval(id); }
    }, stepMs);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

function MiniSparkline({ color, height = 40 }: { color: string; height?: number }) {
  const data = useMemo(() => {
    let v = 100;
    return Array.from({ length: 20 }, (_, i) => {
      v = v + (Math.random() - 0.4) * 3;
      return { i, v };
    });
  }, []);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sg-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProjectionMiniChart({ daily, days, amount, color }: { daily: number; days: number; amount: number; color: string }) {
  const data = useMemo(() => {
    return Array.from({ length: Math.min(days, 30) + 1 }, (_, i) => ({
      d: i,
      v: amount * Math.pow(1 + daily / 100, i),
    }));
  }, [daily, days, amount]);
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={`pg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#pg-${color.replace("#","")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function AITrading() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"daily" | "apy" | "investors">("daily");

  const plansQ = useQuery<Plan[]>({
    queryKey: ["ai-trading-plans"],
    queryFn: () => get<Plan[]>("/ai-trading/plans").catch(() => []),
    staleTime: 60_000,
  });

  const subsQ = useQuery<Subscription[]>({
    queryKey: ["ai-trading-subs"],
    queryFn: () => get<Subscription[]>("/ai-trading/subscriptions").catch(() => []),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const earningsQ = useQuery<{ earnings: Earning[] }>({
    queryKey: ["ai-trading-earnings"],
    queryFn: () => get<{ earnings: Earning[] }>("/ai-trading/earnings?limit=60").catch(() => ({ earnings: [] })),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const plans = useMemo(() => {
    let list = plansQ.data ?? [];
    if (filterRisk !== "all") list = list.filter(p => p.riskLevel === filterRisk);
    if (sortBy === "daily") list = [...list].sort((a, b) => b.dailyReturnPercent - a.dailyReturnPercent);
    if (sortBy === "apy") list = [...list].sort((a, b) => (b.dailyReturnPercent * 365) - (a.dailyReturnPercent * 365));
    if (sortBy === "investors") list = [...list].sort((a, b) => (b.totalInvestors || 0) - (a.totalInvestors || 0));
    return list;
  }, [plansQ.data, filterRisk, sortBy]);

  const subs = subsQ.data ?? [];
  const earnings = earningsQ.data?.earnings ?? [];

  const activeSubs = subs.filter(s => s.status === "active");
  const completedSubs = subs.filter(s => s.status === "completed");
  const pastSubs = subs.filter(s => s.status === "completed" || s.status === "cancelled");
  const [invoiceSubId, setInvoiceSubId] = useState<number | null>(null);
  const totalInvested = activeSubs.reduce((s, x) => s + x.investedAmount, 0);
  const totalEarned = subs.reduce((s, x) => s + (x.totalEarned || 0), 0);
  const totalCurrentValue = activeSubs.reduce((s, x) => s + (x.currentValue || x.investedAmount), 0);
  const unrealizedPnl = totalCurrentValue - totalInvested;

  const cancelMutation = useMutation({
    mutationFn: (id: number) => post(`/ai-trading/subscriptions/${id}/cancel`),
    onSuccess: () => {
      toast.success("Bot cancelled — investment refunded to your USDT wallet.");
      qc.invalidateQueries({ queryKey: ["ai-trading-subs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel bot"),
  });

  const earningsChartData = useMemo(() => {
    const map = new Map<string, number>();
    let cumulative = 0;
    for (const e of [...earnings].reverse()) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      cumulative += e.amountUsdt;
      map.set(d, cumulative);
    }
    return Array.from(map.entries()).slice(-21).map(([date, cumAmount]) => ({ date, cumAmount }));
  }, [earnings]);

  const dailyEarnings = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of earnings) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      map.set(d, (map.get(d) ?? 0) + e.amountUsdt);
    }
    return Array.from(map.entries()).slice(-14).map(([date, amount]) => ({ date, amount }));
  }, [earnings]);

  // Profit & Loss breakdown across all credited entries (losses are negative).
  const pnlStats = useMemo(() => {
    let profit = 0, loss = 0, wins = 0, losses = 0;
    for (const e of earnings) {
      if (e.amountUsdt >= 0) { profit += e.amountUsdt; wins++; }
      else { loss += e.amountUsdt; losses++; }
    }
    const net = profit + loss;
    const winRate = earnings.length > 0 ? (wins / earnings.length) * 100 : 0;
    return { profit, loss, net, wins, losses, winRate };
  }, [earnings]);

  const counterInvested = useCountUp(totalInvested);
  const counterEarned = useCountUp(totalEarned);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Hero Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            <PulsingDot color="#f59e0b" />
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-widest">Live Trading</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight mb-1">
              AI Trading Bots
              <span className="ml-3 inline-flex items-center gap-1 text-sm font-normal text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-0.5">
                <Sparkles className="w-3.5 h-3.5" /> Powered by Zebvix AI Engine
              </span>
            </h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Institutional-grade automated strategies. Deploy capital, earn daily returns — no trading experience required.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0"
            onClick={() => { plansQ.refetch(); subsQ.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {user && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="col-span-2 lg:col-span-1">
            <PremiumStatCard
              hero
              title="Active Bots"
              value={activeSubs.length}
              icon={Bot}
              loading={subsQ.isLoading}
              hint={`${completedSubs.length} completed all-time`}
            />
          </div>
          <PremiumStatCard
            title="Total Invested"
            value={counterInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"}
            icon={DollarSign}
            loading={subsQ.isLoading}
            hint="USDT across active bots"
          />
          <PremiumStatCard
            title="Total Earned"
            value={counterEarned.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " USDT"}
            icon={TrendingUp}
            loading={subsQ.isLoading}
            hint="All-time bot earnings credited"
          />
          <PremiumStatCard
            title="Unrealized P&L"
            value={(unrealizedPnl >= 0 ? "+" : "") + unrealizedPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT"}
            icon={Sparkles}
            loading={subsQ.isLoading}
            hint="Current portfolio vs invested"
          />
        </div>
      )}

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { icon: <Lock className="w-3.5 h-3.5" />, text: "Non-custodial" },
          { icon: <Activity className="w-3.5 h-3.5" />, text: "Daily payouts" },
          { icon: <Shield className="w-3.5 h-3.5" />, text: "Stop-loss protection" },
          { icon: <RefreshCw className="w-3.5 h-3.5" />, text: "Cancel anytime" },
          { icon: <Infinity className="w-3.5 h-3.5" />, text: "Auto-compounding" },
          { icon: <Award className="w-3.5 h-3.5" />, text: "Audited strategies" },
        ].map(f => (
          <span key={f.text} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 border border-border/50 rounded-full px-3 py-1">
            {f.icon} {f.text}
          </span>
        ))}
      </div>

      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList className="bg-muted h-10">
          <TabsTrigger value="plans" className="gap-1.5">
            <Cpu className="w-4 h-4" /> Bot Plans
          </TabsTrigger>
          {user && (
            <TabsTrigger value="active" className="gap-1.5">
              <Bot className="w-4 h-4" />
              My Bots
              {activeSubs.length > 0 && (
                <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[10px] bg-amber-500 text-black">
                  {activeSubs.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {user && (
            <TabsTrigger value="earnings" className="gap-1.5">
              <BarChart2 className="w-4 h-4" /> Profit &amp; Loss
            </TabsTrigger>
          )}
        </TabsList>

        {/* ───────────────────── PLANS TAB ─────────────────────────────── */}
        <TabsContent value="plans" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {(["all", "low", "medium", "high", "ultra"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setFilterRisk(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                    filterRisk === r
                      ? "bg-amber-500 text-black border-amber-500"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {r === "all" ? "All Plans" : getRisk(r).label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              Sort:
              {(["daily", "apy", "investors"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2.5 py-1 rounded-lg border transition-all ${
                    sortBy === s ? "bg-muted text-foreground border-border" : "border-transparent hover:border-border/40"
                  }`}
                >
                  {s === "daily" ? "Daily %" : s === "apy" ? "APY" : "Popular"}
                </button>
              ))}
            </div>
          </div>

          {plansQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-80 rounded-2xl bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState icon={Bot} title="No plans match your filter"
              description="Try selecting a different risk category." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onSubscribe={() => {
                  if (!user) { window.location.href = "/login"; return; }
                  setSelectedPlan(plan);
                  setSubscribeOpen(true);
                }} />
              ))}
            </div>
          )}

          {/* How It Works */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400" />
              How AI Bots Work
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[
                { step: "01", title: "Choose a Plan", desc: "Select a bot strategy matching your risk appetite and investment size." },
                { step: "02", title: "Deposit Capital", desc: "USDT or INR is locked into the bot's smart execution engine." },
                { step: "03", title: "AI Trades 24/7", desc: "Algorithms execute trades continuously, capturing market inefficiencies." },
                { step: "04", title: "Earn Daily", desc: "Returns are credited to your wallet every day at midnight UTC." },
              ].map(s => (
                <div key={s.step} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-amber-400">{s.step}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ───────────────────── MY BOTS TAB ───────────────────────────── */}
        {user && (
          <TabsContent value="active" className="space-y-5">
            {subsQ.isLoading ? (
              <div className="space-y-4">
                {[1, 2].map(i => <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse" />)}
              </div>
            ) : subs.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No active bots"
                description="Browse plans and activate a bot to start earning automated daily returns."
                action={<Button variant="outline" size="sm">Browse Plans</Button>}
              />
            ) : (
              <>
                {activeSubs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <PulsingDot color="#10b981" />
                      Active Bots ({activeSubs.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeSubs.map(sub => <BotCard key={sub.id} sub={sub} onCancel={() => cancelMutation.mutate(sub.id)} cancelling={cancelMutation.isPending} onInvoice={() => setInvoiceSubId(sub.id)} />)}
                    </div>
                  </div>
                )}

                {pastSubs.length > 0 && (
                  <SectionCard title="Bot History" icon={CheckCircle2}
                    description={`${pastSubs.length} past ${pastSubs.length === 1 ? "bot" : "bots"} — buy & stop records with invoices`} padded={false}>
                    <div className="divide-y divide-border/50">
                      {pastSubs.map(sub => {
                        const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;
                        const risk = getRisk(sub.riskLevel.toLowerCase());
                        const earnedPositive = (sub.totalEarned || 0) >= 0;
                        return (
                          <div key={sub.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: risk.glow, border: `1px solid ${risk.color}30` }}>
                                <span style={{ color: risk.color }}>{risk.icon}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{sub.planName}</span>
                                  <StatusPill status={sub.status} />
                                </div>
                                <div className="text-[11px] text-muted-foreground">{fmtDate(sub.startedAt)} → {sub.expiresAt ? fmtDate(sub.expiresAt) : "stopped"}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <div className={`text-sm font-mono font-semibold ${earnedPositive ? "text-emerald-400" : "text-rose-400"}`}>
                                  {earnedPositive ? "+" : ""}{fmtUSD(sub.totalEarned || 0, 4)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">{roi.toFixed(2)}% ROI · {fmtUSD(sub.investedAmount)} invested</div>
                              </div>
                              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                                onClick={() => setInvoiceSubId(sub.id)}>
                                <Receipt className="w-3.5 h-3.5" />
                                Invoice
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* ───────────────────── EARNINGS TAB ──────────────────────────── */}
        {user && (
          <TabsContent value="earnings" className="space-y-5">
            {/* Cumulative chart */}
            {earningsChartData.length > 0 && (
              <SectionCard title="Cumulative Earnings" icon={TrendingUp}
                description="Total bot returns accumulated over time">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={earningsChartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                        tickFormatter={v => `${v.toFixed(2)} U`} width={62} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                        formatter={(v: any) => [`${Number(v).toFixed(6)} USDT`, "Cumulative"]} />
                      <Area type="monotone" dataKey="cumAmount" stroke="#10b981" strokeWidth={2}
                        fill="url(#cumGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {/* P&L summary cards */}
            {earnings.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <div className="text-[11px] text-muted-foreground mb-1">Total Profit</div>
                  <div className="text-lg font-bold font-mono text-emerald-400">+{fmtUSD(pnlStats.profit, 4)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{pnlStats.wins} winning credits</div>
                </div>
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4">
                  <div className="text-[11px] text-muted-foreground mb-1">Total Loss</div>
                  <div className="text-lg font-bold font-mono text-rose-400">{fmtUSD(pnlStats.loss, 4)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{pnlStats.losses} losing credits</div>
                </div>
                <div className={`rounded-xl border p-4 ${pnlStats.net >= 0 ? "border-emerald-500/25 bg-emerald-500/5" : "border-rose-500/25 bg-rose-500/5"}`}>
                  <div className="text-[11px] text-muted-foreground mb-1">Net P&amp;L</div>
                  <div className={`text-lg font-bold font-mono ${pnlStats.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {pnlStats.net >= 0 ? "+" : ""}{fmtUSD(pnlStats.net, 4)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">across {earnings.length} entries</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-[11px] text-muted-foreground mb-1">Win Rate</div>
                  <div className="text-lg font-bold font-mono text-foreground">{pnlStats.winRate.toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">profitable credits</div>
                </div>
              </div>
            )}

            {/* Daily P&L bar chart (green profit / red loss) */}
            {dailyEarnings.length > 0 && (
              <SectionCard title="Daily Profit / Loss" icon={BarChart2}
                description="Per-day net bot result (last 14 days)">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyEarnings} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                        tickFormatter={v => `${v.toFixed(4)} U`} width={64} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                        formatter={(v: any) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(6)} USDT`, Number(v) >= 0 ? "Profit" : "Loss"]} />
                      <Bar dataKey="amount" name="Daily P&L" radius={[4, 4, 0, 0]}>
                        {dailyEarnings.map((d, i) => (
                          <Cell key={i} fill={d.amount >= 0 ? "#10b981" : "#f43f5e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {/* P&L history list */}
            <SectionCard title="Profit & Loss History" icon={Activity}
              description={`${earnings.length} total entries`} padded={false}>
              {earningsQ.isLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Loading history…</div>
              ) : earnings.length === 0 ? (
                <EmptyState icon={BarChart2} title="No history yet"
                  description="Bot profit and loss entries are credited automatically as your bots trade." />
              ) : (
                <div className="divide-y divide-border/50">
                  {earnings.map(e => {
                    const isProfit = e.amountUsdt >= 0;
                    return (
                      <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${
                            isProfit ? "bg-emerald-500/10 border-emerald-500/25" : "bg-rose-500/10 border-rose-500/25"
                          }`}>
                            {isProfit
                              ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                              : <TrendingUp className="w-3.5 h-3.5 text-rose-400 rotate-180" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{e.planName}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(e.creditedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-semibold text-sm ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                            {isProfit ? "+" : ""}{e.amountUsdt.toFixed(6)} USDT
                          </div>
                          <div className="text-[10px] text-muted-foreground">{isProfit ? "Profit" : "Loss"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>

      {/* Subscribe Dialog */}
      {selectedPlan && (
        <SubscribeDialog
          plan={selectedPlan}
          open={subscribeOpen}
          onClose={() => { setSubscribeOpen(false); setSelectedPlan(null); }}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["ai-trading-subs"] }); }}
        />
      )}

      {/* AI Trading Invoice / Statement */}
      <AiInvoiceDialog subId={invoiceSubId} onClose={() => setInvoiceSubId(null)} />
    </div>
  );
}

/* ─────────────────────── AI Trading Invoice Dialog ──────────────────────── */
interface AiInvoice {
  invoiceNo: string;
  issuedAt: string;
  exchange: { name: string; short: string; legal: string; cin: string; gst: string; address: string };
  user: { id?: number; name: string; email: string };
  bot: {
    subscriptionId: number; planName: string; riskLevel: string | null;
    dailyReturnPercent: number | null; durationDays: number | null;
    status: "active" | "completed" | "cancelled"; statusLabel: string; payouts: number;
    startedAt: string | null; expiresAt: string | null; lastCreditedAt: string | null;
  };
  charges: { tdsEnabled: boolean; tdsRatePct: number; tdsNote: string };
  totals: {
    principalUsdt: number; grossProfitUsdt: number; tdsUsdt: number; netProfitUsdt: number;
    principalReturned: boolean; payoutUsdt: number; roiPct: number;
    principalInr: number; grossProfitInr: number; tdsInr: number; netProfitInr: number;
    payoutInr: number; inrRate: number;
  };
  legend: string;
}

function fmtInr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AiInvoiceDialog({ subId, onClose }: { subId: number | null; onClose: () => void }) {
  const invQ = useQuery<AiInvoice>({
    queryKey: ["ai-trading-invoice", subId],
    queryFn: () => get<AiInvoice>(`/ai-trading/subscriptions/${subId}/invoice`),
    enabled: subId != null,
  });
  const inv = invQ.data;

  function handlePrint() {
    if (!inv) return;
    const profitPositive = inv.totals.grossProfitUsdt >= 0;
    // Escape every dynamic value before injecting into the print document to
    // avoid HTML/script injection from user- or plan-controlled strings.
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const row = (label: string, usdt: string, inr: string, strong = false) =>
      `<tr${strong ? ' style="font-weight:700"' : ""}><td>${esc(label)}</td><td style="text-align:right">${esc(usdt)}</td><td style="text-align:right">${esc(inr)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(inv.invoiceNo)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:32px;font-size:13px}
        h1{font-size:20px;margin:0 0 2px} .muted{color:#666} .right{text-align:right}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
        .grid{display:flex;gap:32px;margin-bottom:16px} .grid>div{flex:1}
        table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:7px 8px;border-bottom:1px solid #e5e5e5}
        th{text-align:left;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
        .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid}
        .total{font-size:15px} .legend{margin-top:14px;color:#666;font-size:11px}
      </style></head><body>
      <div class="head">
        <div><h1>${esc(inv.exchange.name)}</h1><div class="muted">${esc(inv.exchange.legal)}</div>
          <div class="muted">${esc(inv.exchange.address)} · CIN ${esc(inv.exchange.cin)} · GST ${esc(inv.exchange.gst)}</div></div>
        <div class="right"><div style="font-size:16px;font-weight:700">INVOICE</div>
          <div class="muted">${esc(inv.invoiceNo)}</div>
          <div class="muted">${esc(new Date(inv.issuedAt).toLocaleString("en-IN"))}</div>
          <div style="margin-top:6px"><span class="badge">${esc(inv.bot.statusLabel)}</span></div></div>
      </div>
      <div class="grid">
        <div><div class="muted">Billed To</div><div style="font-weight:700">${esc(inv.user.name)}</div>
          <div class="muted">${esc(inv.user.email)}</div><div class="muted">User ID: ${esc(inv.user.id ?? "—")}</div></div>
        <div class="right"><div class="muted">Bot / Strategy</div><div style="font-weight:700">${esc(inv.bot.planName)}</div>
          <div class="muted">Sub #${esc(inv.bot.subscriptionId)} · ${esc(inv.bot.dailyReturnPercent ?? "—")}%/day</div>
          <div class="muted">Started ${esc(inv.bot.startedAt ? new Date(inv.bot.startedAt).toLocaleDateString("en-IN") : "—")}</div>
          <div class="muted">${esc(inv.bot.expiresAt ? "Ends " + new Date(inv.bot.expiresAt).toLocaleDateString("en-IN") : "No fixed expiry")}</div></div>
      </div>
      <table><thead><tr><th>Description</th><th class="right">USDT</th><th class="right">INR</th></tr></thead><tbody>
        ${row("Principal invested (Buy)", inv.totals.principalUsdt.toFixed(4) + " USDT", fmtInr(inv.totals.principalInr))}
        ${row(profitPositive ? "Gross profit" : "Gross loss", (profitPositive ? "+" : "") + inv.totals.grossProfitUsdt.toFixed(4) + " USDT", fmtInr(inv.totals.grossProfitInr))}
        ${row(`TDS (${inv.charges.tdsRatePct}% on profit)`, "-" + inv.totals.tdsUsdt.toFixed(4) + " USDT", "-" + fmtInr(inv.totals.tdsInr))}
        ${row("Net profit / loss", (profitPositive ? "+" : "") + inv.totals.netProfitUsdt.toFixed(4) + " USDT", fmtInr(inv.totals.netProfitInr), true)}
        ${row(inv.totals.principalReturned ? "Total payout (principal + net)" : "Net profit so far (principal still locked)", inv.totals.payoutUsdt.toFixed(4) + " USDT", fmtInr(inv.totals.payoutInr), true)}
      </tbody></table>
      <div class="legend">${esc(inv.legend)}<br/>ROI: ${esc(inv.totals.roiPct)}% · Payouts credited: ${esc(inv.bot.payouts)} · 1 USDT ≈ ₹${esc(inv.totals.inrRate.toFixed(2))}</div>
      <div class="legend">This is a system-generated statement for AI Trading activity and does not require a signature.</div>
      </body></html>`;
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) { toast.error("Allow pop-ups to print the invoice."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const profitPositive = (inv?.totals.grossProfitUsdt ?? 0) >= 0;

  return (
    <Dialog open={subId != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            AI Trading Invoice
          </DialogTitle>
          <DialogDescription>
            Buy, stop &amp; profit/loss statement for this bot.
          </DialogDescription>
        </DialogHeader>

        {invQ.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading invoice…</div>
        ) : invQ.isError || !inv ? (
          <div className="py-12 text-center text-sm text-rose-400 flex flex-col items-center gap-2">
            <XCircle className="w-6 h-6" />
            Could not load this invoice.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header block */}
            <div className="flex items-start justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
              <div>
                <div className="font-bold text-foreground">{inv.exchange.name}</div>
                <div className="text-[11px] text-muted-foreground">{inv.exchange.legal}</div>
                <div className="text-[11px] text-muted-foreground mt-1">Invoice {inv.invoiceNo}</div>
              </div>
              <StatusPill status={inv.bot.status} />
            </div>

            {/* Bot + user */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Billed to</div>
                <div className="font-medium text-foreground truncate">{inv.user.name}</div>
                <div className="text-muted-foreground truncate">{inv.user.email}</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Bot</div>
                <div className="font-medium text-foreground truncate">{inv.bot.planName}</div>
                <div className="text-muted-foreground">
                  {inv.bot.dailyReturnPercent ?? "—"}%/day · #{inv.bot.subscriptionId}
                </div>
                <div className="text-muted-foreground">
                  {inv.bot.startedAt ? fmtDate(inv.bot.startedAt) : "—"} → {inv.bot.expiresAt ? fmtDate(inv.bot.expiresAt) : "no expiry"}
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                <span>Description</span><span className="text-right">USDT</span><span className="text-right">INR</span>
              </div>
              {[
                { label: "Principal invested (Buy)", usdt: `${inv.totals.principalUsdt.toFixed(4)}`, inr: fmtInr(inv.totals.principalInr), cls: "" },
                { label: profitPositive ? "Gross profit" : "Gross loss", usdt: `${profitPositive ? "+" : ""}${inv.totals.grossProfitUsdt.toFixed(4)}`, inr: fmtInr(inv.totals.grossProfitInr), cls: profitPositive ? "text-emerald-400" : "text-rose-400" },
                { label: `TDS (${inv.charges.tdsRatePct}% on profit)`, usdt: `-${inv.totals.tdsUsdt.toFixed(4)}`, inr: `-${fmtInr(inv.totals.tdsInr)}`, cls: "text-muted-foreground" },
                { label: "Net profit / loss", usdt: `${profitPositive ? "+" : ""}${inv.totals.netProfitUsdt.toFixed(4)}`, inr: fmtInr(inv.totals.netProfitInr), cls: profitPositive ? "text-emerald-400 font-bold" : "text-rose-400 font-bold" },
              ].map(r => (
                <div key={r.label} className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2.5 border-t border-border/40 text-xs items-center">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={`text-right font-mono ${r.cls}`}>{r.usdt}</span>
                  <span className={`text-right font-mono ${r.cls}`}>{r.inr}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-3 border-t-2 border-border bg-muted/30 text-sm items-center">
                <span className="font-semibold">{inv.totals.principalReturned ? "Total payout" : "Net P&L so far"}</span>
                <span className="text-right font-mono font-bold">{inv.totals.payoutUsdt.toFixed(4)}</span>
                <span className="text-right font-mono font-bold flex items-center justify-end gap-0.5"><IndianRupee className="w-3 h-3" />{inv.totals.payoutInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground leading-relaxed">
              {inv.legend}<br />
              ROI: <span className={profitPositive ? "text-emerald-400" : "text-rose-400"}>{inv.totals.roiPct}%</span> · Payouts credited: {inv.bot.payouts} · 1 USDT ≈ ₹{inv.totals.inrRate.toFixed(2)}
              {!inv.totals.principalReturned && <><br />Principal is still locked while this bot is active and will be returned to your wallet when you stop it.</>}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" />
                Print / Save PDF
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Plan Card ──────────────────────────────────────── */
function PlanCard({ plan, onSubscribe }: { plan: Plan; onSubscribe: () => void }) {
  const risk = getRisk(plan.riskLevel);
  const annualized = (plan.dailyReturnPercent * 365).toFixed(0);
  const totalRoi = (plan.dailyReturnPercent * plan.durationDays).toFixed(1);
  const [hoveredAmt, setHoveredAmt] = useState(plan.minInvestment);
  const dailyProfit = hoveredAmt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;

  return (
    <div
      className="group relative rounded-2xl border bg-card/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 flex flex-col"
      style={{
        borderColor: `${risk.color}30`,
        boxShadow: `0 0 0 0 ${risk.color}`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 40px ${risk.glow}, 0 0 0 1px ${risk.color}40`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${risk.color}`;
      }}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${risk.color}, ${risk.color}80)` }} />

      {/* Sparkline background */}
      <div className="absolute top-0 right-0 left-0 h-20 opacity-20 pointer-events-none">
        <MiniSparkline color={risk.color} height={80} />
      </div>

      <div className="p-5 flex flex-col flex-1 relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-foreground text-base leading-tight">{plan.name}</h3>
              {plan.dailyReturnPercent >= 3 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold">HOT</span>
              )}
            </div>
            {plan.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{plan.description}</p>
            )}
          </div>
          <span className={`ml-3 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-semibold shrink-0 ${risk.badge}`}>
            {risk.icon} {risk.label}
          </span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-3 rounded-xl" style={{ background: `${risk.color}12` }}>
            <div className="text-xl font-black" style={{ color: risk.color }}>{plan.dailyReturnPercent}%</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Daily</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-amber-500/10">
            <div className="text-xl font-black text-amber-400">{annualized}%</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Est. APY</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/40">
            <div className="text-xl font-black text-foreground">{plan.durationDays}d</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Duration</div>
          </div>
        </div>

        {/* Live profit calculator */}
        <div className="mb-4 p-3.5 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Target className="w-3 h-3" /> Profit Calculator
            </span>
            <span className="text-[11px] font-mono text-foreground">${hoveredAmt.toLocaleString()}</span>
          </div>
          <Slider
            min={plan.minInvestment}
            max={Math.min(plan.maxInvestment, plan.minInvestment * 20)}
            step={plan.minInvestment}
            value={[hoveredAmt]}
            onValueChange={([v]) => setHoveredAmt(v)}
            className="mb-2.5"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-xs font-bold text-emerald-400">+{dailyProfit.toFixed(2)} USDT</div>
              <div className="text-[10px] text-muted-foreground">Per day</div>
            </div>
            <div className="text-center p-2 rounded-lg" style={{ background: `${risk.color}10`, border: `1px solid ${risk.color}20` }}>
              <div className="text-xs font-bold" style={{ color: risk.color }}>+{totalProfit.toFixed(2)} USDT</div>
              <div className="text-[10px] text-muted-foreground">Total profit</div>
            </div>
          </div>
          {/* Mini projection chart */}
          <div className="mt-2 -mx-1">
            <ProjectionMiniChart daily={plan.dailyReturnPercent} days={plan.durationDays} amount={hoveredAmt} color={risk.color} />
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Investment range</span>
            <span className="font-mono">${plan.minInvestment.toLocaleString()} — ${plan.maxInvestment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total ROI (est.)</span>
            <span className="font-mono font-semibold text-emerald-400">+{totalRoi}%</span>
          </div>
          {(plan.totalInvestors || 0) > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Active investors</span>
              <span className="font-mono">{(plan.totalInvestors || 0).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* ROI progress bar */}
        <div className="mb-4">
          <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(100, parseFloat(totalRoi))}%`,
              background: `linear-gradient(90deg, ${risk.color}, ${risk.color}99)`,
            }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0%</span>
            <span>{totalRoi}% total return</span>
          </div>
        </div>

        <div className="mt-auto">
          <Button
            className="w-full h-10 font-bold text-sm transition-all duration-200 gap-2"
            style={plan.isActive ? { background: risk.color, color: "#000" } : {}}
            variant={plan.isActive ? "default" : "outline"}
            onClick={onSubscribe}
            disabled={!plan.isActive}
          >
            {plan.isActive ? (
              <><Play className="w-4 h-4" /> Start Bot <ChevronRight className="w-4 h-4" /></>
            ) : (
              "Coming Soon"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Bot Card ───────────────────────────────────────── */
function BotCard({ sub, onCancel, cancelling, onInvoice }: {
  sub: Subscription; onCancel: () => void; cancelling: boolean; onInvoice: () => void;
}) {
  const risk = getRisk(sub.riskLevel.toLowerCase());
  const now = useNow();
  const startMs = new Date(sub.startedAt).getTime();
  const noExpire = sub.noExpire || !sub.expiresAt;
  const elapsedMs = now - startMs;
  const remainingMs = sub.expiresAt ? new Date(sub.expiresAt).getTime() - now : 0;
  const totalMs = sub.expiresAt ? new Date(sub.expiresAt).getTime() - startMs : 0;
  const progress = noExpire
    ? 100
    : totalMs > 0 ? Math.min(100, ((totalMs - Math.max(0, remainingMs)) / totalMs) * 100) : 0;
  const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;
  // Average earning per day since the bot was bought (min 1 day so a
  // freshly-started bot doesn't show an inflated per-day figure).
  const daysRunning = Math.max(1, elapsedMs / 86400000);
  const avgPerDay = (sub.totalEarned || 0) / daysRunning;
  // Projected yearly average profit, annualised from the realised per-day
  // average since the bot started running. No time limit — bot runs until stopped.
  const yearlyAvg = avgPerDay * 365;
  const yearlyRoi = sub.investedAmount > 0 ? (yearlyAvg / sub.investedAmount) * 100 : 0;

  return (
    <div
      className="relative rounded-2xl border bg-card/60 overflow-hidden"
      style={{ borderColor: `${risk.color}30`, boxShadow: `0 0 24px ${risk.glow}` }}
    >
      <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${risk.color}, ${risk.color}40)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <PulsingDot color={risk.color} />
              <span className="font-bold text-foreground">{sub.planName}</span>
            </div>
            <div className="flex items-center gap-1 text-xs mt-1" style={{ color: risk.color }}>
              {risk.icon}
              <span>{risk.label}</span>
            </div>
          </div>
          <StatusPill status={sub.status} />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: "Invested", value: fmtUSD(sub.investedAmount), cls: "" },
            { label: "Earned", value: `+${fmtUSD(sub.totalEarned || 0, 4)}`, cls: "text-emerald-400" },
            { label: "Avg earning", value: `+${fmtUSD(avgPerDay, 4)}/day`, cls: "text-emerald-400" },
            { label: "Daily return", value: `+${fmtUSD(sub.dailyReturn, 2)}/day`, cls: "text-amber-400" },
            { label: "Current value", value: fmtUSD(sub.currentValue ?? sub.investedAmount, 2), cls: "" },
            { label: "ROI", value: `${roi.toFixed(2)}%`, cls: roi >= 0 ? "text-emerald-400" : "text-rose-400" },
          ].map(m => (
            <div key={m.label} className="p-2.5 rounded-xl bg-muted/30 border border-border/40">
              <div className={`text-sm font-bold font-mono ${m.cls}`}>{m.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Live timer */}
        <div className="mb-4 rounded-xl border p-3" style={{ borderColor: `${risk.color}25`, background: `${risk.color}08` }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <Clock className="w-3 h-3" />
              {noExpire ? "Running for" : "Time remaining"}
            </span>
            {noExpire ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Infinity className="w-3 h-3" /> No expiry
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">{daysLeft(sub.expiresAt!)} days left</span>
            )}
          </div>
          <div className="font-mono font-bold text-lg tabular-nums tracking-tight" style={{ color: risk.color }}>
            {noExpire ? fmtDuration(elapsedMs) : fmtDuration(Math.max(0, remainingMs))}
          </div>
          {!noExpire && (
            <>
              <div className="h-2 bg-muted/40 rounded-full overflow-hidden mt-2">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${risk.color}, ${risk.color}80)` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{fmtDate(sub.startedAt)}</span>
                <span>{Math.round(progress)}% done</span>
                <span>{fmtDate(sub.expiresAt!)}</span>
              </div>
            </>
          )}
          {noExpire && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Started {fmtDate(sub.startedAt)} · earning {fmtUSD(sub.dailyReturn, 2)}/day · runs with no time limit
            </div>
          )}
        </div>

        {/* Projected yearly average profit */}
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <TrendingUp className="w-3 h-3" /> Yearly average profit
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {yearlyRoi >= 0 ? "+" : ""}{yearlyRoi.toFixed(1)}% / yr
            </span>
          </div>
          <div className="font-mono font-bold text-lg tabular-nums tracking-tight text-emerald-400">
            +{fmtUSD(yearlyAvg, 2)}<span className="text-xs font-normal text-muted-foreground"> / year</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Annualised from {fmtUSD(avgPerDay, 4)}/day average over {Math.floor(daysRunning)}d running
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-8 gap-1.5"
            onClick={onCancel}
            disabled={cancelling}
          >
            <Lock className="w-3.5 h-3.5" />
            {cancelling ? "Stopping…" : "Stop Bot & Withdraw"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onInvoice}
          >
            <Receipt className="w-3.5 h-3.5" />
            Invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Subscribe Dialog ───────────────────────────────── */
function SubscribeDialog({ plan, open, onClose, onSuccess }: {
  plan: Plan; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(plan.minInvestment));
  const [currency, setCurrency] = useState<"USDT" | "INR">("USDT");
  const [noExpire, setNoExpire] = useState(true);
  const risk = getRisk(plan.riskLevel);

  const rateQ = useQuery<{ inrRate: number }>({
    queryKey: ["inr-rate"],
    queryFn: () => get<{ inrRate: number }>("/rates"),
    staleTime: 60_000,
    enabled: open,
  });

  const subscribeMutation = useMutation({
    mutationFn: (data: object) => post("/ai-trading/subscribe", data),
    onSuccess: () => {
      toast.success(`${plan.name} bot activated! Daily earnings start tomorrow.`);
      onSuccess();
      onClose();
      setAmount(String(plan.minInvestment));
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start bot"),
  });

  const numAmt = parseFloat(amount) || 0;
  const rate = rateQ.data?.inrRate ?? 84;
  const minAmt = currency === "USDT" ? plan.minInvestment : plan.minInvestment * rate;
  const maxAmt = currency === "USDT" ? plan.maxInvestment : plan.maxInvestment * rate;
  const amtInUsdt = currency === "USDT" ? numAmt : numAmt / rate;
  const dailyProfit = amtInUsdt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;
  const totalReturn = amtInUsdt + totalProfit;
  const roi = amtInUsdt > 0 ? (totalProfit / amtInUsdt) * 100 : 0;

  const projectionData = useMemo(() => {
    if (amtInUsdt <= 0) return [];
    return Array.from({ length: Math.min(plan.durationDays, 30) + 1 }, (_, i) => ({
      d: `D${i}`,
      v: parseFloat((amtInUsdt + amtInUsdt * (plan.dailyReturnPercent / 100) * i).toFixed(4)),
    }));
  }, [amtInUsdt, plan.dailyReturnPercent, plan.durationDays]);

  const isValid = numAmt >= minAmt && numAmt <= maxAmt;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span style={{ color: risk.color }}>{risk.icon}</span>
            Activate {plan.name}
          </DialogTitle>
          <DialogDescription>Configure your investment amount and start earning daily returns.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Currency toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["USDT", "INR"] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  currency === c
                    ? "text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={currency === c ? { background: risk.color } : {}}>
                {c === "INR" ? "₹ INR" : "USDT"}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">
              Investment Amount ({currency})
              <span className="ml-2 text-xs">Min: {currency === "USDT" ? `${plan.minInvestment.toLocaleString()} USDT` : `₹${(plan.minInvestment * rate).toLocaleString()}`}</span>
            </Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={String(minAmt)}
              className="h-11"
            />
            {numAmt > 0 && !isValid && (
              <p className="text-xs text-rose-400 mt-1.5">
                {numAmt < minAmt ? `Minimum: ${currency === "USDT" ? "" : "₹"}${minAmt.toLocaleString()}${currency === "USDT" ? " USDT" : ""}` : `Maximum: ${currency === "USDT" ? "" : "₹"}${maxAmt.toLocaleString()}${currency === "USDT" ? " USDT" : ""}`}
              </p>
            )}
          </div>

          {/* Run duration */}
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">Run Duration</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNoExpire(true)}
                className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all ${
                  noExpire ? "border-emerald-500/50 bg-emerald-500/10" : "border-border/60 hover:border-border"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Infinity className="w-4 h-4 text-emerald-400" /> Run forever
                </span>
                <span className="text-[10px] text-muted-foreground">No expiry · stop anytime</span>
              </button>
              <button
                type="button"
                onClick={() => setNoExpire(false)}
                className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all ${
                  !noExpire ? "border-amber-500/50 bg-amber-500/10" : "border-border/60 hover:border-border"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Calendar className="w-4 h-4 text-amber-400" /> {plan.durationDays}-day term
                </span>
                <span className="text-[10px] text-muted-foreground">Auto-completes at end</span>
              </button>
            </div>
          </div>

          {/* Projection */}
          {amtInUsdt > 0 && (
            <>
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${risk.color}30`, background: `${risk.color}08` }}>
                <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: risk.color }}>
                  {risk.icon} Earnings Projection
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-background/60">
                    <div className="text-sm font-bold text-emerald-400">+{dailyProfit.toFixed(2)} USDT</div>
                    <div className="text-[10px] text-muted-foreground">Per day</div>
                  </div>
                  <div className="p-2 rounded-lg bg-background/60">
                    <div className="text-sm font-bold text-emerald-400">+{totalProfit.toFixed(2)} USDT</div>
                    <div className="text-[10px] text-muted-foreground">Total profit</div>
                  </div>
                  <div className="p-2 rounded-lg bg-background/60">
                    <div className="text-sm font-bold text-foreground">{totalReturn.toFixed(2)} USDT</div>
                    <div className="text-[10px] text-muted-foreground">Final value</div>
                  </div>
                </div>
                <div className="text-center">
                  {noExpire ? (
                    <>
                      <span className="text-xs text-muted-foreground">Est. </span>
                      <span className="text-xs font-bold text-emerald-400">+{roi.toFixed(2)}%</span>
                      <span className="text-xs text-muted-foreground"> per {plan.durationDays} days · runs until you stop it</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">Total ROI: </span>
                      <span className="text-xs font-bold text-emerald-400">+{roi.toFixed(2)}%</span>
                      <span className="text-xs text-muted-foreground"> over {plan.durationDays} days</span>
                    </>
                  )}
                </div>
                {projectionData.length > 0 && (
                  <div className="h-24 -mx-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projectionData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={risk.color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={risk.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="v" stroke={risk.color} strokeWidth={2}
                          fill="url(#dlGrad)" dot={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any) => [`${Number(v).toFixed(2)} USDT`, "Value"]} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Risk disclaimer */}
              <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3">
                <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Returns shown are estimates based on historical performance. Crypto markets are volatile. Past returns do not guarantee future performance. Cancel anytime for a full refund.</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!isValid || subscribeMutation.isPending}
            onClick={() => subscribeMutation.mutate({ planId: plan.id, amount: currency === "INR" ? numAmt : amtInUsdt, currency, noExpire })}
            style={isValid ? { background: risk.color, color: "#000" } : {}}
            className="font-bold gap-2"
          >
            {subscribeMutation.isPending ? "Activating…" : <><Play className="w-4 h-4" /> Run Bot</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
