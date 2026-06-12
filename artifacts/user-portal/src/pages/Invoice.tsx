import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, AlertCircle } from "lucide-react";

// Tax-invoice page for a single filled order. Designed to look clean both
// in the browser and on the printed page (Save as PDF from the print
// dialog produces a perfectly usable invoice). All numbers come straight
// from the server's /orders/:id/invoice endpoint so they always match the
// wallet movements at fill-time, even if the admin later changes the
// fee/GST/TDS rates.

interface InvoiceData {
  invoiceNo: string;
  issuedAt: string;
  currency: string;
  brand: {
    legalName: string;
    tradingName: string;
    address: string;
    gstin: string;
    pan: string;
    supportEmail: string;
    website: string;
  };
  customer: { name: string; email: string; userId: number };
  order: {
    id: number;
    symbol: string;
    base: string;
    quote: string;
    side: "buy" | "sell";
    type: string;
    status: string;
    qty: number;
    filledQty: number;
    avgPrice: number;
    placedAt: string;
  };
  breakdown: {
    grossNotional: number;
    tradingFee: number;
    gstPercent: number;
    gstAmount: number;
    totalFee: number;
    tdsPercent: number;
    tdsAmount: number;
    netAmount: number;
    direction: "credit" | "debit";
  };
  fills: Array<{
    id: number;
    uid: string;
    price: number;
    qty: number;
    subtotal: number;
    fee: number;
    tds: number;
    executedAt: string;
  }>;
}

const fmtMoney = (n: number, currency: string, dp = 2) => {
  if (!Number.isFinite(n)) return "—";
  // INR uses Indian-grouping; everything else uses generic en-US grouping with
  // the currency code prefixed for clarity (we don't know every quote coin's
  // intl code, so we just prefix the symbol).
  if (currency === "INR") {
    return `₹ ${n.toLocaleString("en-IN", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    })}`;
  }
  return `${n.toLocaleString("en-IN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })} ${currency}`;
};

const fmtQty = (n: number, dp = 8) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: dp })
    : "—";

export default function Invoice() {
  const [, params] = useRoute<{ id: string }>("/orders/:id/invoice");
  const orderId = params?.id;

  const { data, isLoading, isError, error } = useQuery<InvoiceData>({
    queryKey: ["invoice", orderId],
    queryFn: () => get(`/orders/${orderId}/invoice`),
    enabled: !!orderId,
  });

  // Set the document title so the saved PDF gets a sensible filename
  // ("INV-00012345.pdf" instead of "Trade.pdf"). Resets on unmount so the
  // rest of the app keeps the default title.
  useEffect(() => {
    if (!data?.invoiceNo) return;
    const prev = document.title;
    document.title = data.invoiceNo;
    return () => {
      document.title = prev;
    };
  }, [data?.invoiceNo]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-3">Loading invoice…</p>
      </div>
    );
  }

  if (isError || !data) {
    const msg =
      (error as { data?: { message?: string }; message?: string } | null)?.data?.message ??
      (error as { message?: string } | null)?.message ??
      "Could not load invoice";
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <AlertCircle className="w-6 h-6 mx-auto text-destructive mb-3" />
          <p className="font-semibold text-destructive">{msg}</p>
          <p className="text-xs text-muted-foreground mt-2">
            An invoice is generated only after at least one fill has been recorded for the order.
          </p>
          <Link href="/orders">
            <Button variant="outline" size="sm" className="mt-4">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to orders
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { brand, customer, order, breakdown, fills, invoiceNo, issuedAt, currency } = data;
  const isSell = order.side === "sell";
  const directionLabel = isSell ? "Net amount credited" : "Net amount debited";

  return (
    <div className="bg-muted/20 min-h-screen py-6 print:bg-white print:py-0">
      {/* Top action bar — hidden when printing */}
      <div className="container mx-auto px-4 max-w-3xl flex items-center justify-between mb-4 print:hidden">
        <Link href="/orders">
          <Button variant="outline" size="sm" data-testid="btn-invoice-back">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Back to orders
          </Button>
        </Link>
        <Button
          size="sm"
          onClick={() => window.print()}
          data-testid="btn-invoice-print"
        >
          <Printer className="w-3.5 h-3.5 mr-2" />
          Print / Save as PDF
        </Button>
      </div>

      {/* Invoice paper */}
      <div className="container mx-auto px-4 max-w-3xl">
        <div
          className="bg-white text-slate-900 rounded-2xl shadow-sm border border-slate-200 print:rounded-none print:shadow-none print:border-0 print:max-w-none"
          data-testid="invoice-paper"
        >
          {/* Header */}
          <div className="px-8 py-6 border-b border-slate-200 flex items-start justify-between">
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-slate-900">
                {brand.tradingName}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{brand.legalName}</p>
              <p className="text-xs text-slate-500">{brand.address}</p>
              <p className="text-xs text-slate-500 mt-1">
                GSTIN: <span className="font-mono">{brand.gstin}</span> &middot; PAN:{" "}
                <span className="font-mono">{brand.pan}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
                Tax Invoice
              </p>
              <p className="text-lg font-bold mt-0.5" data-testid="invoice-no">
                {invoiceNo}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Issued: {new Date(issuedAt).toLocaleString("en-IN")}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {brand.website} &middot; {brand.supportEmail}
              </p>
            </div>
          </div>

          {/* Bill-to + Order summary */}
          <div className="px-8 py-5 grid grid-cols-2 gap-6 border-b border-slate-200">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Bill to
              </p>
              <p className="font-semibold text-sm mt-1">{customer.name || customer.email}</p>
              <p className="text-xs text-slate-500">{customer.email}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Customer ID: #{customer.userId}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                Order
              </p>
              <p className="font-semibold text-sm mt-1 font-mono">#{order.id} &middot; {order.symbol}</p>
              <p className="text-xs">
                <span
                  className={
                    isSell
                      ? "inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold uppercase tracking-wide text-[10px]"
                      : "inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold uppercase tracking-wide text-[10px]"
                  }
                >
                  {order.side}
                </span>{" "}
                <span className="text-slate-500 uppercase text-[11px]">{order.type}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Placed: {new Date(order.placedAt).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Fills table */}
          <div className="px-8 py-5 border-b border-slate-200">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
              Trade fills ({fills.length})
            </p>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 font-medium">Time</th>
                  <th className="text-right py-2 font-medium">Price ({order.quote})</th>
                  <th className="text-right py-2 font-medium">Qty ({order.base})</th>
                  <th className="text-right py-2 font-medium">Subtotal ({order.quote})</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {fills.map(f => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-600 font-sans">
                      {new Date(f.executedAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </td>
                    <td className="text-right py-2">{fmtQty(f.price, 4)}</td>
                    <td className="text-right py-2">{fmtQty(f.qty, 8)}</td>
                    <td className="text-right py-2">{fmtQty(f.subtotal, 4)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td className="py-2 text-slate-500 font-medium">VWAP &amp; Total</td>
                  <td className="text-right py-2 font-mono tabular-nums">
                    {fmtQty(order.avgPrice, 4)}
                  </td>
                  <td className="text-right py-2 font-mono tabular-nums">
                    {fmtQty(order.filledQty, 8)}
                  </td>
                  <td className="text-right py-2 font-mono tabular-nums font-semibold">
                    {fmtQty(breakdown.grossNotional, 4)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Money breakdown */}
          <div className="px-8 py-5 border-b border-slate-200">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-3">
              Tax breakdown
            </p>
            <div className="space-y-2 text-sm">
              <Row label="Gross trade value" value={fmtMoney(breakdown.grossNotional, currency, 4)} />
              <Row
                label="Trading fee (excl. GST)"
                value={`- ${fmtMoney(breakdown.tradingFee, currency, 4)}`}
                muted
              />
              <Row
                label={`GST @ ${breakdown.gstPercent}%`}
                value={`- ${fmtMoney(breakdown.gstAmount, currency, 4)}`}
                muted
              />
              {isSell && (
                <Row
                  label={`TDS @ ${breakdown.tdsPercent}% (sec 194S)`}
                  value={`- ${fmtMoney(breakdown.tdsAmount, currency, 4)}`}
                  muted
                  testid="invoice-tds-row"
                />
              )}
              <div className="border-t border-slate-200 pt-3 mt-3 flex items-center justify-between">
                <span className="font-bold text-slate-900">{directionLabel}</span>
                <span
                  className={
                    "font-bold text-lg tabular-nums " +
                    (isSell ? "text-emerald-700" : "text-slate-900")
                  }
                  data-testid="invoice-net"
                >
                  {fmtMoney(breakdown.netAmount, currency, 4)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer notes */}
          <div className="px-8 py-5 text-[11px] text-slate-500 leading-relaxed">
            <p>
              <span className="font-semibold text-slate-700">Note:</span> TDS is deducted at
              source on the proceeds of every spot sell as per Section 194S of the Income
              Tax Act and deposited against your PAN. GST is charged on the trading-fee
              component only, not on the trade value itself.
            </p>
            <p className="mt-2">
              For any disputes please contact{" "}
              <span className="font-mono text-slate-700">{brand.supportEmail}</span> within
              7 days of issue, quoting invoice no <strong>{invoiceNo}</strong>.
            </p>
            <p className="mt-3 text-center text-[10px] text-slate-400">
              This is a computer-generated invoice and does not require a signature.
            </p>
          </div>
        </div>
      </div>

      {/* Print-tuning */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
  testid,
}: {
  label: string;
  value: string;
  muted?: boolean;
  testid?: string;
}) {
  return (
    <div className="flex items-center justify-between" data-testid={testid}>
      <span className={muted ? "text-slate-500" : "text-slate-700"}>{label}</span>
      <span className="font-mono tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
