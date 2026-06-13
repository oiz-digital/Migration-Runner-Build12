/**
 * Trade Invoice — full-colour, printable tax invoice for a filled spot order.
 * Route: /orders/:id/invoice
 * Print / Download PDF: window.print() — add "Save as PDF" in the print dialog.
 * Colours preserved in print via `print-color-adjust: exact`.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  Zap, CheckCircle2, TrendingUp, TrendingDown,
} from "lucide-react";

interface InvoiceData {
  invoiceNo: string;
  issuedAt: string;
  currency: string;
  brand: {
    legalName: string; tradingName: string; address: string;
    gstin: string; cin: string; pan: string; supportEmail: string; website: string;
  };
  customer: { name: string; email: string; userId: number };
  order: {
    id: number; symbol: string; base: string; quote: string;
    side: "buy" | "sell"; type: string; status: string;
    qty: number; filledQty: number; avgPrice: number; placedAt: string;
  };
  breakdown: {
    grossNotional: number; tradingFee: number;
    gstPercent: number; gstAmount: number; totalFee: number;
    tdsPercent: number; tdsAmount: number; netAmount: number;
    netInr: number; inrRate: number; direction: "credit" | "debit";
  };
  fills: Array<{
    id: number; uid: string; price: number; qty: number;
    subtotal: number; fee: number; tds: number; executedAt: string;
  }>;
}

const fmt = (n: number, dp = 4) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : "—";

const fmtInr = (n: number) =>
  Number.isFinite(n)
    ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function Invoice() {
  const [, params] = useRoute<{ id: string }>("/orders/:id/invoice");
  const orderId = params?.id;
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError, error } = useQuery<InvoiceData>({
    queryKey: ["invoice", orderId],
    queryFn: () => get(`/orders/${orderId}/invoice`),
    enabled: !!orderId,
  });

  useEffect(() => {
    if (!data?.invoiceNo) return;
    const prev = document.title;
    document.title = data.invoiceNo;
    return () => { document.title = prev; };
  }, [data?.invoiceNo]);

  const downloadPdf = async () => {
    if (!invoiceRef.current || !data) return;
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
      pdf.save(`${data.invoiceNo}.pdf`);
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#F59E0B" }} />
          <p className="text-sm text-muted-foreground">Loading invoice…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as any)?.data?.message ?? (error as any)?.message ?? "Could not load invoice";
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-3" />
          <p className="font-semibold text-destructive text-lg">{msg}</p>
          <p className="text-sm text-muted-foreground mt-2">
            An invoice is generated only after at least one fill has been recorded.
          </p>
          <Link href="/orders">
            <Button variant="outline" size="sm" className="mt-5">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to orders
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { brand, customer, order, breakdown, fills, invoiceNo, issuedAt, currency } = data;
  const isSell   = order.side === "sell";
  const isBuy    = order.side === "buy";
  const isFilled = order.status === "filled";

  return (
    <div
      className="min-h-screen py-6 print:py-0"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)" }}
    >
      {/* ── Action bar (hidden on print) ── */}
      <div className="container mx-auto px-4 max-w-3xl mb-5 flex items-center justify-between print:hidden">
        <Link href="/orders">
          <Button variant="outline" size="sm" className="border-white/20 text-white/80 hover:text-white hover:border-white/40 bg-white/5">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to orders
          </Button>
        </Link>
        <Button
          size="sm"
          onClick={downloadPdf}
          disabled={downloading}
          style={{ background: "#F59E0B", color: "#0f172a" }}
          className="font-semibold hover:opacity-90 disabled:opacity-70"
        >
          {downloading
            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Generating…</>
            : <><Download className="w-3.5 h-3.5 mr-2" />Download PDF</>}
        </Button>
      </div>

      {/* ── Invoice card ── */}
      <div className="container mx-auto px-4 max-w-3xl">
        <div
          ref={invoiceRef}
          className="rounded-2xl overflow-hidden shadow-2xl print:rounded-none print:shadow-none"
          data-testid="invoice-paper"
        >
          {/* Amber top accent bar */}
          <div style={{ height: 6, background: "linear-gradient(90deg,#F59E0B,#D97706,#B45309)" }} />

          {/* ── Dark header ── */}
          <div
            style={{ background: "#0f172a" }}
            className="px-8 py-6 flex items-start justify-between"
          >
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-sm"
                  style={{ background: "#F59E0B", color: "#0f172a" }}
                >
                  Z
                </div>
                <span className="text-xl font-extrabold tracking-tight" style={{ color: "#F59E0B" }}>
                  {brand.tradingName}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{brand.legalName}</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1 max-w-xs">{brand.address}</p>
              <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
                GSTIN: {brand.gstin} · CIN: {brand.cin}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">PAN: {brand.pan}</p>
            </div>

            {/* Invoice meta */}
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: "#F59E0B" }}>
                Tax Invoice
              </p>
              <p className="text-2xl font-extrabold mt-1 text-white tabular-nums">{invoiceNo}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Issued: {fmtDate(issuedAt)}</p>
              <p className="text-[10px] text-slate-500 mt-1">{brand.website} · {brand.supportEmail}</p>

              {/* Status chip */}
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold"
                style={isFilled
                  ? { background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }
                  : { background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }
                }
              >
                <CheckCircle2 style={{ width: 10, height: 10 }} />
                {order.status.replace("_", " ").toUpperCase()}
              </div>
            </div>
          </div>

          {/* ── White body ── */}
          <div className="bg-white">

            {/* Bill-to + Order summary */}
            <div className="px-8 py-5 grid grid-cols-2 gap-6" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: "#F59E0B" }}>
                  Bill To
                </p>
                <p className="font-bold text-slate-800 text-sm">{customer.name || customer.email}</p>
                <p className="text-xs text-slate-500 mt-0.5">{customer.email}</p>
                <p className="text-[11px] text-slate-400 mt-1">Customer ID: #{customer.userId}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: "#F59E0B" }}>
                  Order Details
                </p>
                <p className="font-bold text-slate-800 text-sm font-mono">
                  #{order.id} · <span className="tracking-wide">{order.symbol}</span>
                </p>
                <div className="flex items-center justify-end gap-2 mt-1.5">
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
                    style={isBuy
                      ? { background: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC" }
                      : { background: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5" }
                    }
                  >
                    {isBuy ? <TrendingUp style={{ width: 10, height: 10 }} /> : <TrendingDown style={{ width: 10, height: 10 }} />}
                    {order.side}
                  </span>
                  <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wide">{order.type}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Placed: {fmtDate(order.placedAt)}</p>
              </div>
            </div>

            {/* Fills table */}
            <div className="px-8 py-5" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-3" style={{ color: "#F59E0B" }}>
                Trade Fills ({fills.length})
              </p>
              {fills.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No fill detail available — summary above.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th className="text-left py-2 font-semibold text-slate-500 text-[11px]">Time</th>
                      <th className="text-right py-2 font-semibold text-slate-500 text-[11px]">Price ({order.quote})</th>
                      <th className="text-right py-2 font-semibold text-slate-500 text-[11px]">Qty ({order.base})</th>
                      <th className="text-right py-2 font-semibold text-slate-500 text-[11px]">Subtotal ({order.quote})</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {fills.map((f, i) => (
                      <tr key={f.id} style={{ background: i % 2 === 0 ? "#f8fafc" : "white", borderBottom: "1px solid #f1f5f9" }}>
                        <td className="py-2 text-slate-500 font-sans text-[11px]">{fmtDate(f.executedAt)}</td>
                        <td className="text-right py-2 text-slate-700">{fmt(f.price, 4)}</td>
                        <td className="text-right py-2 text-slate-700">{fmt(f.qty, 8)}</td>
                        <td className="text-right py-2 text-slate-700">{fmt(f.subtotal, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                      <td className="py-2.5 text-slate-600 font-semibold text-[11px]">VWAP &amp; Total</td>
                      <td className="text-right py-2.5 font-mono tabular-nums font-semibold text-slate-700">{fmt(order.avgPrice, 4)}</td>
                      <td className="text-right py-2.5 font-mono tabular-nums font-semibold text-slate-700">{fmt(order.filledQty, 8)}</td>
                      <td className="text-right py-2.5 font-mono tabular-nums font-semibold text-slate-700">{fmt(breakdown.grossNotional, 4)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Tax breakdown */}
            <div className="px-8 py-5" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-4" style={{ color: "#F59E0B" }}>
                Tax Breakdown
              </p>
              <div className="space-y-2.5">
                <BRow label="Gross trade value" value={`${fmt(breakdown.grossNotional, 4)} ${currency}`} />
                <BRow label="Trading fee (excl. GST)" value={`− ${fmt(breakdown.tradingFee, 4)} ${currency}`} muted />
                <BRow label={`GST @ ${breakdown.gstPercent}% on fee`} value={`− ${fmt(breakdown.gstAmount, 4)} ${currency}`} muted />
                {isSell && (
                  <BRow
                    label={`TDS @ ${breakdown.tdsPercent}% (Sec 194S)`}
                    value={`− ${fmt(breakdown.tdsAmount, 4)} ${currency}`}
                    muted
                  />
                )}

                {/* Net amount total */}
                <div
                  className="mt-4 pt-4 px-4 py-4 rounded-xl flex items-center justify-between"
                  style={{
                    background: isSell ? "#F0FDF4" : "#FFF7ED",
                    border: isSell ? "1.5px solid #86EFAC" : "1.5px solid #FCD34D",
                  }}
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500">
                      {isSell ? "Net Amount Credited" : "Net Amount Debited"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ≈ {fmtInr(breakdown.netInr)} at 1 USDT ≈ ₹{(breakdown.inrRate ?? 84).toFixed(2)}
                    </p>
                  </div>
                  <p
                    className="text-2xl font-extrabold tabular-nums"
                    style={{ color: isSell ? "#15803D" : "#B45309" }}
                  >
                    {fmt(breakdown.netAmount, 4)} {currency}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer notes */}
            <div className="px-8 py-5">
              <div
                className="rounded-xl p-4 text-[11px] leading-relaxed"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <div className="flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
                  <div className="text-slate-500 space-y-1">
                    <p>
                      <span className="font-semibold text-slate-700">TDS (Sec 194S):</span> Deducted at 1% on the gross proceeds
                      of every sell, deposited against your PAN with the government.{" "}
                      <span className="font-semibold text-slate-700">GST:</span> Charged on the trading-fee component only.
                    </p>
                    <p>
                      For disputes, contact{" "}
                      <span className="font-mono font-semibold text-slate-700">{brand.supportEmail}</span>{" "}
                      within 7 days quoting <strong>{invoiceNo}</strong>.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-4">
                This is a computer-generated tax invoice and does not require a physical signature. · {brand.website}
              </p>
            </div>
          </div>

          {/* Bottom amber accent bar */}
          <div style={{ height: 4, background: "linear-gradient(90deg,#B45309,#D97706,#F59E0B)" }} />
        </div>
      </div>

      {/* Print styles — preserves background colors and hides action bar */}
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

function BRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: muted ? "#94a3b8" : "#475569" }}>{label}</span>
      <span className="font-mono tabular-nums font-medium" style={{ color: muted ? "#64748b" : "#0f172a" }}>
        {value}
      </span>
    </div>
  );
}
