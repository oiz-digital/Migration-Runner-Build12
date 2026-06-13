/**
 * AI Trading Statement — full account statement for all AI bot subscriptions in a period.
 * Route: /ai-trading/statement
 * Violet/purple branding. Download as PDF via html2canvas + jsPDF.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  Bot, TrendingUp, TrendingDown, FileText, Zap,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
interface AIStatementData {
  statementNo: string;
  generatedAt: string;
  period: { from: string; to: string };
  brand: {
    legalName: string; tradingName: string; address: string;
    gstin: string; cin: string; pan: string; supportEmail: string; website: string;
  };
  customer: { name: string; email: string; userId: number };
  summary: {
    totalSubscriptions: number; totalEarningsCredits: number;
    totalInvestedUsdt: number; totalInvestedInr: number;
    grossProfitUsdt: number;   grossProfitInr: number;
    tdsPercent: number;        tdsUsdt: number; tdsInr: number;
    netProfitUsdt: number;     netProfitInr: number;
    roiPct: number;            inrRate: number;
  };
  subscriptions: Array<{
    id: number; planName: string; riskLevel: string | null; status: string;
    investedUsdt: number; totalEarnedUsdt: number; roiPct: number;
    startedAt: string; expiresAt: string | null; lastCreditedAt: string | null;
  }>;
  earnings: Array<{
    id: number; subscriptionId: number; planName: string;
    amountUsdt: number; amountInr: number; creditedAt: string;
  }>;
}

/* ── Presets ── */
const now = new Date();
const PRESETS = [
  { label: "This Month",   from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  { label: "Last Month",   from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10) },
  { label: "This Quarter", from: new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  { label: "This Year",    from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  { label: "All Time",     from: "2020-01-01", to: now.toISOString().slice(0, 10) },
];

/* ── Formatters ── */
const fmt  = (n: number, dp = 4) => Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";
const fmtI = (n: number) => Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtD = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const fmtD2 = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  active:    { background: "rgba(16,185,129,0.12)", color: "#059669", border: "1px solid rgba(16,185,129,0.25)" },
  completed: { background: "rgba(96,165,250,0.12)", color: "#2563eb", border: "1px solid rgba(96,165,250,0.25)" },
  cancelled: { background: "rgba(239,68,68,0.12)",  color: "#dc2626", border: "1px solid rgba(239,68,68,0.25)" },
};
const RISK_BADGE: Record<string, React.CSSProperties> = {
  low:    { background: "rgba(16,185,129,0.1)",  color: "#059669" },
  medium: { background: "rgba(245,158,11,0.1)",  color: "#d97706" },
  high:   { background: "rgba(239,68,68,0.1)",   color: "#dc2626" },
  ultra:  { background: "rgba(139,92,246,0.1)",  color: "#7c3aed" },
};

export default function AIStatement() {
  const [from, setFrom] = useState(PRESETS[0].from);
  const [to,   setTo]   = useState(PRESETS[0].to);
  const [activePreset, setActivePreset] = useState("This Month");
  const stmtRef   = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<AIStatementData>({
    queryKey: ["ai-statement", from, to],
    queryFn:  () => get(`/ai-trading/statement?from=${from}&to=${to}`),
  });

  const applyPreset = (p: typeof PRESETS[0]) => { setFrom(p.from); setTo(p.to); setActivePreset(p.label); };
  const handleGenerate = () => { refetch(); };

  const downloadPdf = async () => {
    if (!stmtRef.current || !data) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(stmtRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: "#0f172a" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`${data.statementNo}.pdf`);
      toast.success("Statement downloaded successfully");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const { brand, customer, summary, subscriptions, earnings, statementNo, generatedAt, period } = data ?? {};
  const isProfit = (summary?.netProfitUsdt ?? 0) >= 0;

  return (
    <div className="min-h-screen py-6" style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)" }}>

      {/* ── Toolbar ── */}
      <div className="container mx-auto px-4 max-w-5xl mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/ai-trading">
          <Button variant="outline" size="sm" className="border-white/20 text-white/80 hover:text-white hover:border-white/40 bg-white/5">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to AI Trading
          </Button>
        </Link>
        <Button size="sm" onClick={downloadPdf} disabled={downloading || !data}
          style={{ background: "#8B5CF6", color: "white" }}
          className="font-semibold hover:opacity-90 disabled:opacity-50">
          {downloading
            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Generating…</>
            : <><Download className="w-3.5 h-3.5 mr-2" />Download PDF</>}
        </Button>
      </div>

      {/* ── Date Filter ── */}
      <div className="container mx-auto px-4 max-w-5xl mb-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={activePreset === p.label
                  ? { background: "#8B5CF6", color: "white" }
                  : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset("Custom"); }}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-xs" />
            <span className="text-white/40 text-xs">to</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset("Custom"); }}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-xs" />
            <Button size="sm" onClick={handleGenerate} style={{ background: "#8B5CF6", color: "white" }} className="font-semibold text-xs">
              Generate
            </Button>
          </div>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#8B5CF6" }} />
            <p className="text-sm text-slate-400">Generating AI statement…</p>
          </div>
        </div>
      )}
      {isError && (
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-3" />
            <p className="font-semibold text-destructive">{(error as any)?.data?.message ?? "Failed to load statement"}</p>
          </div>
        </div>
      )}

      {/* ── Statement Paper ── */}
      {data && (
        <div className="container mx-auto px-4 max-w-5xl">
          <div ref={stmtRef} className="rounded-2xl overflow-hidden shadow-2xl" data-testid="ai-statement-paper">

            {/* Violet accent */}
            <div style={{ height: 6, background: "linear-gradient(90deg,#6D28D9,#7C3AED,#8B5CF6,#A78BFA)" }} />

            {/* ── Header ── */}
            <div style={{ background: "#0f172a" }} className="px-8 py-6 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#6D28D9,#8B5CF6)" }}>
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-lg leading-tight">{brand?.tradingName} <span style={{ color: "#A78BFA" }}>AI</span></div>
                    <div className="text-xs text-slate-400">{brand?.legalName}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-xs">{brand?.address}</div>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] text-slate-500">GSTIN: <span className="text-slate-300">{brand?.gstin}</span></span>
                  <span className="text-[10px] text-slate-500">PAN: <span className="text-slate-300">{brand?.pan}</span></span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2 mb-2">
                  <Zap className="w-5 h-5" style={{ color: "#8B5CF6" }} />
                  <span className="font-bold text-white text-lg">AI TRADING STATEMENT</span>
                </div>
                <div className="text-xs text-slate-400">Statement No.</div>
                <div className="font-mono font-bold text-white text-sm">{statementNo}</div>
                <div className="text-xs text-slate-400 mt-1">Generated</div>
                <div className="text-xs text-slate-300">{fmtD(generatedAt!)}</div>
                <div className="text-xs text-slate-400 mt-1">Period</div>
                <div className="text-xs text-slate-300">{fmtD2(period!.from)} — {fmtD2(period!.to)}</div>
              </div>
            </div>

            {/* ── Customer bar ── */}
            <div style={{ background: "#1e1b4b", borderTop: "1px solid rgba(139,92,246,0.15)", borderBottom: "1px solid rgba(139,92,246,0.15)" }}
              className="px-8 py-3 flex flex-wrap gap-6">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Account Holder</div>
                <div className="text-sm font-semibold text-white">{customer?.name}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Email</div>
                <div className="text-sm text-slate-300">{customer?.email}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">User ID</div>
                <div className="text-sm font-mono text-slate-300">#{customer?.userId}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Exchange Rate</div>
                <div className="text-sm text-slate-300">1 USDT ≈ {fmtI(summary!.inrRate)}</div>
              </div>
            </div>

            {/* ── White body ── */}
            <div style={{ background: "#fff" }} className="px-8 py-6">

              {/* Summary cards */}
              <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#7C3AED" }}>
                Summary — {fmtD2(period!.from)} to {fmtD2(period!.to)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Subscriptions", value: summary!.totalSubscriptions.toString(), sub: "bots started" },
                  { label: "Total Invested",  value: fmt(summary!.totalInvestedUsdt, 2) + " USDT",   sub: fmtI(summary!.totalInvestedInr) },
                  { label: "Gross Profit",    value: fmt(summary!.grossProfitUsdt, 4) + " USDT",     sub: fmtI(summary!.grossProfitInr) },
                  { label: "Net Profit (After TDS)", value: fmt(summary!.netProfitUsdt, 4) + " USDT", sub: `ROI: ${summary!.roiPct.toFixed(2)}%` },
                ].map(c => (
                  <div key={c.label} className="rounded-xl p-4 text-center" style={{ background: "#f5f3ff", border: "1px solid #e9d5ff" }}>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-violet-500 mb-1">{c.label}</div>
                    <div className="font-bold text-slate-800 text-sm leading-tight">{c.value}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Net profit highlight */}
              <div className="rounded-xl px-6 py-4 flex items-center justify-between mb-6"
                style={{ background: isProfit ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "linear-gradient(135deg,#fff1f2,#ffe4e6)",
                  border: isProfit ? "1px solid #bbf7d0" : "1px solid #fecdd3" }}>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: isProfit ? "#15803d" : "#be123c" }}>
                    Net Profit After TDS (1% Sec 194S)
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: isProfit ? "#16a34a" : "#dc2626" }}>
                    Gross Profit ₋ {fmt(summary!.tdsUsdt, 4)} USDT TDS = Net Profit
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  {isProfit ? <TrendingUp className="w-6 h-6 text-emerald-500" /> : <TrendingDown className="w-6 h-6 text-red-500" />}
                  <div>
                    <div className="text-xl font-bold" style={{ color: isProfit ? "#15803d" : "#be123c" }}>
                      {isProfit ? "+" : ""}{fmt(summary!.netProfitUsdt, 4)} USDT
                    </div>
                    <div className="text-sm" style={{ color: isProfit ? "#16a34a" : "#dc2626" }}>
                      {fmtI(summary!.netProfitInr)}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Subscriptions Table ── */}
              <div className="mb-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5" style={{ color: "#8B5CF6" }} />
                  Bot Subscriptions ({subscriptions!.length})
                </div>
                {subscriptions!.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    No subscriptions found for this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#f5f3ff" }}>
                          {["Plan", "Risk", "Status", "Invested (USDT)", "Earned (USDT)", "ROI %", "Started", "Expires"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {subscriptions!.map((s, i) => {
                          const roi = s.roiPct;
                          return (
                            <tr key={s.id} style={{ background: i % 2 === 0 ? "#fff" : "#faf5ff" }}>
                              <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{s.planName}</td>
                              <td className="px-3 py-2">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                  style={RISK_BADGE[(s.riskLevel ?? "medium").toLowerCase()] ?? RISK_BADGE.medium}>
                                  {s.riskLevel ?? "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                  style={STATUS_BADGE[s.status] ?? STATUS_BADGE.active}>
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-700">{fmt(s.investedUsdt, 2)}</td>
                              <td className="px-3 py-2 font-mono font-semibold" style={{ color: s.totalEarnedUsdt >= 0 ? "#16a34a" : "#dc2626" }}>
                                {s.totalEarnedUsdt >= 0 ? "+" : ""}{fmt(s.totalEarnedUsdt, 4)}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold" style={{ color: roi >= 0 ? "#16a34a" : "#dc2626" }}>
                                {roi >= 0 ? "+" : ""}{roi.toFixed(2)}%
                              </td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtD2(s.startedAt)}</td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{s.expiresAt ? fmtD2(s.expiresAt) : "—"}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: "#f5f3ff", fontWeight: 700 }}>
                          <td colSpan={3} className="px-3 py-2.5 text-right text-slate-600 text-xs">TOTAL</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{fmt(summary!.totalInvestedUsdt, 2)}</td>
                          <td className="px-3 py-2.5 font-mono font-bold" style={{ color: summary!.grossProfitUsdt >= 0 ? "#16a34a" : "#dc2626" }}>
                            {summary!.grossProfitUsdt >= 0 ? "+" : ""}{fmt(summary!.grossProfitUsdt, 4)}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold" style={{ color: summary!.roiPct >= 0 ? "#16a34a" : "#dc2626" }}>
                            {summary!.roiPct >= 0 ? "+" : ""}{summary!.roiPct.toFixed(2)}%
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Earnings Credits ── */}
              {earnings!.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" style={{ color: "#8B5CF6" }} />
                    Earnings Credit Log ({earnings!.length})
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0" style={{ background: "#f5f3ff" }}>
                        <tr>
                          {["#", "Plan", "Amount (USDT)", "Amount (INR)", "Credited At"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {earnings!.map((e, i) => (
                          <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#faf5ff" }}>
                            <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                            <td className="px-3 py-2 text-slate-700">{e.planName}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-emerald-600">+{fmt(e.amountUsdt, 4)}</td>
                            <td className="px-3 py-2 font-mono text-emerald-600">{fmtI(e.amountInr)}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtD(e.creditedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tax Summary ── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600"
                  style={{ background: "#f5f3ff" }}>Tax Summary (Indian Compliance — VDA)</div>
                {[
                  ["Total Invested",                   fmt(summary!.totalInvestedUsdt, 2) + " USDT", fmtI(summary!.totalInvestedInr)],
                  ["Gross Profit",                     fmt(summary!.grossProfitUsdt,   4) + " USDT", fmtI(summary!.grossProfitInr)],
                  [`TDS @ ${summary!.tdsPercent}% (Sec 194S VDA)`, fmt(summary!.tdsUsdt, 4) + " USDT", fmtI(summary!.tdsInr)],
                  ["NET PROFIT AFTER TDS",             fmt(summary!.netProfitUsdt, 4) + " USDT", fmtI(summary!.netProfitInr)],
                  ["Overall ROI",                      summary!.roiPct.toFixed(2) + "%", "net profit ÷ total invested"],
                ].map(([label, val, sub], i, arr) => (
                  <div key={label} className="flex items-center justify-between px-5 py-2.5"
                    style={{
                      borderTop: i > 0 ? "1px solid #e2e8f0" : undefined,
                      background: i === arr.length - 2 ? (summary!.netProfitUsdt >= 0 ? "#f0fdf4" : "#fff1f2") : "#fff",
                      fontWeight: i === arr.length - 2 ? 700 : 400,
                    }}>
                    <span className="text-xs text-slate-600">{label}</span>
                    <div className="text-right">
                      <span className="text-xs font-mono text-slate-800">{val}</span>
                      {sub && <span className="text-[10px] text-slate-400 ml-2">{sub}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Footer ── */}
              <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <div>
                  {brand?.legalName} · CIN: {brand?.cin} · GSTIN: {brand?.gstin}<br />
                  {brand?.supportEmail} · {brand?.website}
                </div>
                <div className="text-right">
                  This is a computer-generated statement.<br />
                  No signature required. TDS u/s 194S PMLA 2002.
                </div>
              </div>
            </div>

            {/* Bottom violet accent */}
            <div style={{ height: 4, background: "linear-gradient(90deg,#6D28D9,#8B5CF6,#A78BFA)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
