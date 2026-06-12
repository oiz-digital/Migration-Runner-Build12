import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { createChart, AreaSeries, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import {
  TrendingUp, TrendingDown, PieChart, Calculator, Download,
  Sparkles, Wallet, Activity, Target, IndianRupee, BarChart3, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Allocation = {
  symbol: string; name: string; icon: string | null;
  valueUsd: number; valueInr: number; pct: number; change24hPct: number; balance: number;
};
type Summary = {
  totalEquityUsd: number; totalEquityInr: number;
  pnl24hUsd: number;  pnl24hInr: number; pnl24hPct: number;
  activeAssets: number; inrRate: number;
  allocation: Allocation[];
};
type HistoryPoint = { date: string; equityUsd: number; equityInr: number };
type TaxReport = {
  fyStart: string; inrRate: number;
  totals: {
    totalBuyUsd: number; totalBuyInr: number;
    totalSellUsd: number; totalSellInr: number;
    totalFeesUsd: number; totalFeesInr: number;
    grossPnl: number; grossPnlInr: number;
    buyCount: number; sellCount: number; tradeCount: number;
  };
  tax: {
    tdsPaidUsd: number; tdsPaidInr: number;
    taxableProfit: number; taxableProfitInr: number;
    incomeTaxUsd: number; incomeTaxInr: number;
    totalTaxLiabilityUsd: number; totalTaxLiabilityInr: number;
    effectiveRatePct: number;
  };
  note: string;
};

const PIE_COLORS = ["#f59e0b","#22c55e","#3b82f6","#ec4899","#a855f7","#14b8a6","#f97316","#06b6d4","#84cc16","#facc15"];

function fmtInr(n: number, decimals = 2): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function fmtInrShort(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`;
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(2)}K`;
  return fmtInr(n);
}

export default function PortfolioPro() {
  const [days, setDays] = useState("30");

  const { data: summary } = useQuery({
    queryKey: ["/portfolio/analytics/summary"],
    queryFn: () => get<Summary>("/portfolio/analytics/summary"),
    refetchInterval: 30_000,
  });
  const { data: history } = useQuery({
    queryKey: ["/portfolio/analytics/history", days],
    queryFn: () => get<{ days: number; inrRate: number; points: HistoryPoint[] }>(`/portfolio/analytics/history?days=${days}`),
  });

  const allocation = summary?.allocation ?? [];
  const inrRate    = summary?.inrRate ?? 84;
  const pnlPositive = (summary?.pnl24hInr ?? 0) >= 0;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="Pro Analytics"
        title="Portfolio PRO"
        description="Equity curve, allocation breakdown, aur Indian crypto tax report — sab ek jagah."
        actions={
          summary?.inrRate ? (
            <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
              <IndianRupee className="h-3 w-3 mr-1" />
              1 USDT = ₹{summary.inrRate.toFixed(2)}
            </Badge>
          ) : undefined
        }
      />

      {/* Stat cards — all in ₹ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PremiumStatCard
          title="Total equity"
          value={summary ? fmtInrShort(summary.totalEquityInr) : "—"}
          icon={Wallet}
          hint={summary ? `≈ ${summary.totalEquityUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDT` : undefined}
          accent
        />
        <PremiumStatCard
          title="24h P&L"
          value={summary ? `${pnlPositive ? "+" : ""}${fmtInrShort(summary.pnl24hInr)}` : "—"}
          icon={pnlPositive ? TrendingUp : TrendingDown}
          hint={summary ? `${summary.pnl24hPct >= 0 ? "+" : ""}${summary.pnl24hPct.toFixed(2)}%` : undefined}
          accent={pnlPositive}
        />
        <PremiumStatCard
          title="24h change"
          value={summary ? `${summary.pnl24hPct >= 0 ? "+" : ""}${summary.pnl24hPct.toFixed(2)}%` : "—"}
          icon={Activity}
          accent={pnlPositive}
        />
        <PremiumStatCard
          title="Active assets"
          value={String(summary?.activeAssets ?? 0)}
          icon={PieChart}
          hint="Wallets with balance"
        />
      </div>

      <Tabs defaultValue="curve">
        <TabsList className="grid w-full sm:w-auto grid-cols-3">
          <TabsTrigger value="curve"><Activity className="h-3.5 w-3.5 mr-1.5" /> Equity curve</TabsTrigger>
          <TabsTrigger value="alloc"><PieChart className="h-3.5 w-3.5 mr-1.5" /> Allocation</TabsTrigger>
          <TabsTrigger value="tax"><Calculator className="h-3.5 w-3.5 mr-1.5" /> Tax report</TabsTrigger>
        </TabsList>

        {/* ── Equity Curve ── */}
        <TabsContent value="curve" className="mt-4">
          <SectionCard
            title="Equity history (₹)"
            description="Synthetic curve based on current holdings and 24h change. Daily snapshots coming soon."
            actions={
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <EquityChart points={history?.points ?? []} />
          </SectionCard>
        </TabsContent>

        {/* ── Allocation ── */}
        <TabsContent value="alloc" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <SectionCard title="Distribution">
              {allocation.length === 0 ? (
                <EmptyState icon={PieChart} title="No allocation" description="Deposit some funds to see this." />
              ) : (
                <Donut allocation={allocation} />
              )}
            </SectionCard>
            <SectionCard className="lg:col-span-2" title="Holdings">
              {allocation.length === 0 ? (
                <EmptyState icon={Wallet} title="No holdings" description="Empty for now." />
              ) : (
                <div className="space-y-1.5">
                  {allocation.map((a, i) => (
                    <div key={`${a.symbol}-${i}`} className="rounded-lg border border-border/50 bg-card/40 p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-[11px]"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] + "20", color: PIE_COLORS[i % PIE_COLORS.length] }}
                        >
                          {a.symbol[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">
                              {a.symbol} <span className="text-muted-foreground font-normal text-xs">{a.name}</span>
                            </span>
                            <div className="text-right">
                              <div className="font-mono font-bold text-sm">
                                {fmtInr(a.valueInr, 0)}
                              </div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                ≈ ${a.valueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${a.pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground w-12 text-right">
                              {a.pct.toFixed(1)}%
                            </span>
                            <span className={`font-mono text-[11px] w-16 text-right ${a.change24hPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {a.change24hPct >= 0 ? "+" : ""}{a.change24hPct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── Tax Report ── */}
        <TabsContent value="tax" className="mt-4">
          <TaxReportPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Equity Chart ─── */
function EquityChart({ points }: { points: HistoryPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef  = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { color: "transparent" }, textColor: "#9ca3af", fontSize: 11 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;
    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#f59e0b",
      topColor: "rgba(245,158,11,0.4)",
      bottomColor: "rgba(245,158,11,0)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => fmtInrShort(v) },
    });
    return () => { try { chart.remove(); } catch {} chartRef.current = null; seriesRef.current = null; };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || points.length === 0) return;
    seriesRef.current.setData(points.map((p) => ({
      time: p.date as Time,
      value: p.equityInr,
    })));
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  return <div ref={ref} className="h-72 w-full" />;
}

/* ─── Donut Chart ─── */
function Donut({ allocation }: { allocation: Allocation[] }) {
  const top = allocation.slice(0, 8);
  const otherPct = allocation.slice(8).reduce((s, a) => s + a.pct, 0);
  const segments = otherPct > 0
    ? [...top, { symbol: "Other", name: "Other", icon: null, valueUsd: 0, valueInr: 0, pct: otherPct, change24hPct: 0, balance: 0 }]
    : top;

  let acc = 0;
  const radius = 80, stroke = 24;
  const c = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const dash = (s.pct / 100) * c;
          const offset = (acc / 100) * c;
          acc += s.pct;
          return (
            <circle key={`${s.symbol}-${i}`} cx="100" cy="100" r={radius}
              fill="none"
              stroke={PIE_COLORS[i % PIE_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            />
          );
        })}
        <text x="100" y="95"  textAnchor="middle" className="fill-foreground font-mono font-bold text-base">{segments.length}</text>
        <text x="100" y="110" textAnchor="middle" className="fill-muted-foreground text-[9px]">assets</text>
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] w-full">
        {segments.map((s, i) => (
          <div key={`${s.symbol}-${i}`} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-muted-foreground flex-1 min-w-0 line-clamp-1">{s.symbol}</span>
            <span className="font-mono font-bold">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tax Report Panel ─── */
function TaxReportPanel() {
  const { data } = useQuery({
    queryKey: ["/portfolio/analytics/tax-report"],
    queryFn: () => get<TaxReport>("/portfolio/analytics/tax-report"),
  });

  const exportCsv = () => {
    if (!data) return;
    const rate = data.inrRate ?? 84;
    const rows = [
      ["Field", "Value (₹ INR)", "Value (USDT)"],
      ["Total buys",          fmtInr(data.totals.totalBuyInr),            data.totals.totalBuyUsd.toFixed(2)],
      ["Total sells",         fmtInr(data.totals.totalSellInr),           data.totals.totalSellUsd.toFixed(2)],
      ["Total fees",          fmtInr(data.totals.totalFeesInr),           data.totals.totalFeesUsd.toFixed(2)],
      ["Gross PnL",           fmtInr(data.totals.grossPnlInr),            data.totals.grossPnl.toFixed(2)],
      ["TDS paid (1%)",       fmtInr(data.tax.tdsPaidInr),               data.tax.tdsPaidUsd.toFixed(2)],
      ["Taxable profit",      fmtInr(data.tax.taxableProfitInr),         data.tax.taxableProfit.toFixed(2)],
      ["Income tax (30%)",    fmtInr(data.tax.incomeTaxInr),             data.tax.incomeTaxUsd.toFixed(2)],
      ["Total tax liability", fmtInr(data.tax.totalTaxLiabilityInr),     data.tax.totalTaxLiabilityUsd.toFixed(2)],
      ["USDT/INR rate used",  `₹${rate.toFixed(2)}`,                     "1"],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `zebvix-tax-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Tax report exported (₹ INR)");
  };

  if (!data) return <SectionCard><div className="py-12 text-center text-muted-foreground">Loading…</div></SectionCard>;

  const rate = data.inrRate ?? 84;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Indian Crypto Tax Report (FY)"
        description="1% TDS har sell pe (Sec 194S) + 30% flat tax profits pe (Sec 115BBH)."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground hidden sm:flex">
              1 USDT = ₹{rate.toFixed(2)}
            </Badge>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
        }
      >
        {/* Top 3 tax cards */}
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">TDS Paid</div>
            <div className="font-mono font-bold text-lg text-amber-400 mt-1">
              {fmtInr(data.tax.tdsPaidInr)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">1% of every sell — Sec 194S</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Taxable Profit</div>
            <div className={`font-mono font-bold text-lg ${data.tax.taxableProfit > 0 ? "text-emerald-400" : "text-muted-foreground"} mt-1`}>
              {fmtInr(data.tax.taxableProfitInr)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Losses cannot be offset — Sec 115BBH</div>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-rose-400">Total Tax Liability</div>
            <div className="font-mono font-bold text-lg text-rose-400 mt-1">
              {fmtInr(data.tax.totalTaxLiabilityInr)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">30% flat on profits — Sec 115BBH</div>
          </div>
        </div>

        {/* Trade summary */}
        <div className="mt-4 grid sm:grid-cols-4 gap-2 text-xs font-mono">
          <Stat label="Buys"     value={`${data.totals.buyCount} trades`}  sub={fmtInr(data.totals.totalBuyInr, 0)} />
          <Stat label="Sells"    value={`${data.totals.sellCount} trades`} sub={fmtInr(data.totals.totalSellInr, 0)} />
          <Stat label="Fees"     value={fmtInr(data.totals.totalFeesInr)} sub={`${data.totals.totalFeesUsd.toFixed(2)} USDT`} />
          <Stat label="Gross PnL" value={`${data.totals.grossPnl >= 0 ? "+" : ""}${fmtInr(data.totals.grossPnlInr, 0)}`} good={data.totals.grossPnl >= 0} sub={`${data.totals.grossPnl.toFixed(2)} USDT`} />
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground italic">{data.note}</p>
      </SectionCard>
    </div>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded border border-border/50 bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold mt-0.5 ${good === undefined ? "text-foreground" : good ? "text-emerald-400" : "text-rose-400"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
