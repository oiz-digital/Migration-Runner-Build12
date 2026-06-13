/**
 * AI Trading Invoice — full-colour, printable statement for an AI bot subscription.
 * Route: /ai-trading/:id/invoice
 * Shows: principal invested, gross profit, TDS, net profit, ROI, payout.
 * Download PDF: window.print() → "Save as PDF" in the browser print dialog.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  Bot, TrendingUp, TrendingDown, CheckCircle2,
  Zap, Clock,
} from "lucide-react";

interface AIInvoiceData {
  invoiceNo: string;
  issuedAt: string;
  type: string;
  exchange: {
    name: string; short: string; legal: string;
    cin: string; gst: string; address: string;
  };
  user: { id?: number; name: string; email: string };
  bot: {
    subscriptionId: number; planName: string; riskLevel: string | null;
    dailyReturnPercent: number | null; durationDays: number | null;
    status: "active" | "completed" | "cancelled"; statusLabel: string; payouts: number;
    startedAt: string | null; expiresAt: string | null; lastCreditedAt: string | null;
  };
  charges: { tdsEnabled: boolean; tdsRatePct: number; tdsNote: string };
  totals: {
    principalUsdt: number; grossProfitUsdt: number; tdsUsdt: number;
    netProfitUsdt: number; principalReturned: boolean; payoutUsdt: number; roiPct: number;
    principalInr: number; grossProfitInr: number; tdsInr: number;
    netProfitInr: number; payoutInr: number; inrRate: number;
  };
  legend: string;
}

const fmtU = (n: number, dp = 4) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";

const fmtInr = (n: number) =>
  Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTs = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  active:    { background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" },
  completed: { background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.3)" },
  cancelled: { background: "rgba(248,113,113,0.12)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)" },
};
const RISK_STYLE: Record<string, React.CSSProperties> = {
  low:    { background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" },
  medium: { background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" },
  high:   { background: "rgba(248,113,113,0.12)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)" },
};

export default function AIInvoice() {
  const [, params] = useRoute<{ id: string }>("/ai-trading/:id/invoice");
  const subId = params?.id;
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: inv, isLoading, isError, error } = useQuery<AIInvoiceData>({
    queryKey: ["ai-invoice", subId],
    queryFn: () => get(`/ai-trading/subscriptions/${subId}/invoice`),
    enabled: !!subId,
  });

  useEffect(() => {
    if (!inv?.invoiceNo) return;
    const prev = document.title;
    document.title = inv.invoiceNo;
    return () => { document.title = prev; };
  }, [inv?.invoiceNo]);

  const downloadPdf = async () => {
    if (!invoiceRef.current || !inv) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#0f172a",
      });
      const imgW = canvas.width;
      const imgH = canvas.height;
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [imgW / 2, imgH / 2] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW / 2, imgH / 2);
      pdf.save(`${inv.invoiceNo}.pdf`);
      toast.success("Invoice downloaded successfully");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#8B5CF6" }} />
          <p className="text-sm text-slate-400">Loading AI Trading Invoice…</p>
        </div>
      </div>
    );
  }

  if (isError || !inv) {
    const msg = (error as any)?.data?.message ?? (error as any)?.message ?? "Could not load invoice";
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-3" />
          <p className="font-semibold text-destructive text-lg">{msg}</p>
          <Link href="/ai-trading">
            <Button variant="outline" size="sm" className="mt-5">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to AI Trading
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { exchange, user, bot, charges, totals } = inv;
  const isProfit  = totals.grossProfitUsdt >= 0;
  const roiColor  = isProfit ? "#10B981" : "#F87171";
  const statusSty = STATUS_STYLE[bot.status] ?? STATUS_STYLE.active;
  const riskSty   = RISK_STYLE[(bot.riskLevel ?? "").toLowerCase()] ?? RISK_STYLE.medium;

  return (
    <div
      className="min-h-screen py-6 print:py-0"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)" }}
    >
      {/* ── Action bar ── */}
      <div className="container mx-auto px-4 max-w-3xl mb-5 flex items-center justify-between print:hidden">
        <Link href="/ai-trading">
          <Button variant="outline" size="sm" className="border-white/20 text-white/80 hover:text-white hover:border-white/40 bg-white/5">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to AI Trading
          </Button>
        </Link>
        <Button
          size="sm"
          onClick={downloadPdf}
          disabled={downloading}
          style={{ background: "#8B5CF6", color: "white" }}
          className="font-semibold hover:opacity-90 disabled:opacity-70"
        >
          {downloading
            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Generating…</>
            : <><Download className="w-3.5 h-3.5 mr-2" />Download PDF</>}
        </Button>
      </div>

      {/* ── Invoice card ── */}
      <div className="container mx-auto px-4 max-w-3xl">
        <div ref={invoiceRef} className="rounded-2xl overflow-hidden shadow-2xl print:rounded-none print:shadow-none" data-testid="ai-invoice-paper">

          {/* Violet top accent bar */}
          <div style={{ height: 6, background: "linear-gradient(90deg,#6D28D9,#7C3AED,#8B5CF6,#A78BFA)" }} />

          {/* ── Dark header ── */}
          <div style={{ background: "#0f172a" }} className="px-8 py-6">
            <div className="flex items-start justify-between">
              {/* Brand */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}
                  >
                    <Bot style={{ width: 16, height: 16, color: "white" }} />
                  </div>
                  <span className="text-xl font-extrabold tracking-tight" style={{ color: "#A78BFA" }}>
                    {exchange.short}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium mt-0.5">AI Trading</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{exchange.name}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1 max-w-xs">{exchange.address}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1.5">
                  GSTIN: {exchange.gst} · CIN: {exchange.cin}
                </p>
              </div>

              {/* Invoice meta */}
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: "#A78BFA" }}>
                  AI Trading Statement
                </p>
                <p className="text-2xl font-extrabold mt-1 text-white tabular-nums">{inv.invoiceNo}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Issued: {fmtTs(inv.issuedAt)}</p>

                {/* Status badge */}
                <div className="mt-2.5 flex items-center justify-end gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={statusSty}
                  >
                    {bot.status === "active"
                      ? <Zap style={{ width: 9, height: 9 }} />
                      : bot.status === "completed"
                      ? <CheckCircle2 style={{ width: 9, height: 9 }} />
                      : <Clock style={{ width: 9, height: 9 }} />
                    }
                    {bot.statusLabel}
                  </span>
                </div>

                {/* ROI */}
                <div
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{
                    background: isProfit ? "rgba(16,185,129,0.12)" : "rgba(248,113,113,0.12)",
                    border: isProfit ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(248,113,113,0.3)",
                  }}
                >
                  {isProfit
                    ? <TrendingUp style={{ width: 12, height: 12, color: "#10B981" }} />
                    : <TrendingDown style={{ width: 12, height: 12, color: "#F87171" }} />
                  }
                  <span className="font-extrabold text-sm tabular-nums" style={{ color: roiColor }}>
                    {isProfit ? "+" : ""}{totals.roiPct.toFixed(2)}% ROI
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── White body ── */}
          <div className="bg-white">

            {/* Bill-to + Bot info */}
            <div className="px-8 py-5 grid grid-cols-2 gap-6" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: "#7C3AED" }}>
                  Bill To
                </p>
                <p className="font-bold text-slate-800 text-sm">{user.name || user.email}</p>
                <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                <p className="text-[11px] text-slate-400 mt-1">Customer ID: #{user.id}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: "#7C3AED" }}>
                  Bot / Strategy
                </p>
                <p className="font-bold text-slate-800 text-sm">{bot.planName}</p>
                <div className="flex items-center justify-end gap-2 mt-1.5">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={riskSty}
                  >
                    {bot.riskLevel ?? "N/A"} risk
                  </span>
                  {bot.dailyReturnPercent !== null && (
                    <span className="text-[11px] text-slate-500 font-mono">{bot.dailyReturnPercent}%/day</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Sub #<span className="font-mono">{bot.subscriptionId}</span>
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="px-8 py-4 grid grid-cols-3 gap-4" style={{ borderBottom: "1px solid #e2e8f0", background: "#fafafa" }}>
              {[
                { label: "Started", value: fmtDate(bot.startedAt) },
                { label: "Expires", value: bot.expiresAt ? fmtDate(bot.expiresAt) : "No expiry" },
                { label: "Last credited", value: fmtDate(bot.lastCreditedAt) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400">{label}</p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Earnings breakdown table */}
            <div className="px-8 py-5" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-4" style={{ color: "#7C3AED" }}>
                Earnings Statement
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th className="text-left py-2 font-semibold text-slate-500 text-[11px]">Description</th>
                    <th className="text-right py-2 font-semibold text-slate-500 text-[11px]">USDT</th>
                    <th className="text-right py-2 font-semibold text-slate-500 text-[11px]">INR (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Principal invested",
                      usdt: fmtU(totals.principalUsdt) + " USDT",
                      inr: fmtInr(totals.principalInr),
                      style: { background: "#f8fafc" },
                    },
                    {
                      label: isProfit ? "Gross profit" : "Gross loss",
                      usdt: (isProfit ? "+" : "") + fmtU(totals.grossProfitUsdt) + " USDT",
                      inr: fmtInr(totals.grossProfitInr),
                      style: { color: isProfit ? "#15803D" : "#DC2626", background: isProfit ? "#F0FDF4" : "#FEF2F2" },
                    },
                    {
                      label: `TDS @ ${charges.tdsRatePct}% on profit`,
                      usdt: "− " + fmtU(totals.tdsUsdt) + " USDT",
                      inr: "− " + fmtInr(totals.tdsInr),
                      style: { color: "#64748b", background: "#f8fafc" },
                    },
                    {
                      label: "Net profit / loss",
                      usdt: (isProfit ? "+" : "") + fmtU(totals.netProfitUsdt) + " USDT",
                      inr: fmtInr(totals.netProfitInr),
                      style: { fontWeight: 700, color: isProfit ? "#15803D" : "#DC2626", background: isProfit ? "#DCFCE7" : "#FEE2E2" },
                    },
                  ].map(({ label, usdt, inr, style }) => (
                    <tr key={label} style={{ ...style, borderBottom: "1px solid #f1f5f9" }}>
                      <td className="py-2.5 px-1 text-slate-700">{label}</td>
                      <td className="text-right py-2.5 px-1 font-mono tabular-nums">{usdt}</td>
                      <td className="text-right py-2.5 px-1 font-mono tabular-nums text-slate-500">{inr}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #7C3AED", background: "#faf5ff" }}>
                    <td className="py-3 px-1 font-bold text-violet-800 text-[11px]">
                      {totals.principalReturned
                        ? "Total payout (principal + net profit)"
                        : "Profit accrued (principal still locked)"}
                    </td>
                    <td className="text-right py-3 px-1 font-extrabold text-violet-700 font-mono tabular-nums">
                      {fmtU(totals.payoutUsdt)} USDT
                    </td>
                    <td className="text-right py-3 px-1 font-bold text-violet-600 font-mono tabular-nums">
                      {fmtInr(totals.payoutInr)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Stats bar */}
            <div className="px-8 py-4 grid grid-cols-3 gap-4" style={{ borderBottom: "1px solid #e2e8f0", background: "#fafafa" }}>
              {[
                { label: "ROI", value: (isProfit ? "+" : "") + totals.roiPct.toFixed(2) + "%", color: roiColor },
                { label: "Payouts credited", value: String(bot.payouts), color: "#475569" },
                { label: "1 USDT ≈", value: `₹${totals.inrRate.toFixed(2)}`, color: "#475569" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center rounded-lg py-2.5 px-3" style={{ background: "white", border: "1px solid #e2e8f0" }}>
                  <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400">{label}</p>
                  <p className="font-extrabold text-base mt-0.5 tabular-nums" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-8 py-5">
              <div
                className="rounded-xl p-4 text-[11px] leading-relaxed"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <div className="flex items-start gap-2">
                  <Bot className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#8B5CF6" }} />
                  <div className="text-slate-500 space-y-1">
                    <p>{inv.legend}</p>
                    <p>
                      <span className="font-semibold text-slate-700">TDS Note:</span> {charges.tdsNote}.
                      Deducted at {charges.tdsRatePct}% on realized profit (Sec 194S) and deposited with the government.
                    </p>
                    <p>
                      This statement is auto-generated for AI Trading bot #{bot.subscriptionId}. INR values are indicative only.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-4">
                Computer-generated statement — does not require a physical signature. · {exchange.name}
              </p>
            </div>
          </div>

          {/* Bottom violet accent bar */}
          <div style={{ height: 4, background: "linear-gradient(90deg,#6D28D9,#7C3AED,#A78BFA)" }} />
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; }
          * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
