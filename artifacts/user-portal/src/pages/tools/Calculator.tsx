import { useEffect, useMemo, useState } from "react";
import { Calculator as CalcIcon, ArrowDownUp, TrendingUp, TrendingDown, Info, RotateCcw, IndianRupee, Percent } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTickers } from "@/lib/marketSocket";

type Side = "long" | "short";

const FEE_RATE = 0.001;

function fmt(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function currencySymbol(pair: string): string {
  const quote = pair.split("/")[1] || "";
  if (quote === "INR") return "₹";
  if (quote === "USDT" || quote === "USDC" || quote === "USD") return "";
  if (quote === "BTC") return "₿";
  if (quote === "ETH") return "Ξ";
  return quote ? `${quote} ` : "₹";
}

export default function CalculatorPage() {
  const tickers = useTickers();
  const symbols = useMemo(
    () => Object.keys(tickers).filter((s) => tickers[s]?.lastPrice > 0).sort(),
    [tickers],
  );

  const [pair, setPair] = useState<string>("");
  const [side, setSide] = useState<Side>("long");
  const [leverage, setLeverage] = useState<number>(1);
  const [entry, setEntry] = useState<string>("");
  const [exit, setExit] = useState<string>("");
  const [size, setSize] = useState<string>("1000");

  // Auto-pick first pair once data arrives
  useEffect(() => {
    if (!pair && symbols.length) {
      const pick = symbols.find((s) => s.includes("BTC")) || symbols[0];
      setPair(pick);
    }
  }, [symbols, pair]);

  // Prefill entry from live price when pair changes
  useEffect(() => {
    if (pair && tickers[pair]?.lastPrice && !entry) {
      const p = tickers[pair].lastPrice;
      setEntry(p.toFixed(p < 1 ? 6 : 2));
      setExit((p * 1.05).toFixed(p < 1 ? 6 : 2));
    }
  }, [pair, tickers, entry]);

  const live = pair ? tickers[pair]?.lastPrice ?? 0 : 0;
  const sym = currencySymbol(pair);

  const calc = useMemo(() => {
    const e = parseFloat(entry);
    const x = parseFloat(exit);
    const s = parseFloat(size);
    if (!e || !x || !s || e <= 0 || x <= 0 || s <= 0) return null;

    const positionValue = s * leverage;
    const qty = positionValue / e;
    const direction = side === "long" ? 1 : -1;
    const pnl = (x - e) * qty * direction;
    const margin = s;
    const roi = (pnl / margin) * 100;
    const fees = positionValue * FEE_RATE * 2; // entry + exit
    const netPnl = pnl - fees;
    const netRoi = (netPnl / margin) * 100;

    // Liquidation (very simplified, isolated margin, no maintenance)
    const liq =
      leverage > 1
        ? side === "long"
          ? e * (1 - 1 / leverage)
          : e * (1 + 1 / leverage)
        : null;

    return { qty, positionValue, pnl, roi, fees, netPnl, netRoi, liq };
  }, [entry, exit, size, leverage, side]);

  const reset = () => {
    setSide("long");
    setLeverage(1);
    setEntry("");
    setExit("");
    setSize("1000");
  };

  const useLivePrice = () => {
    if (live > 0) setEntry(live.toFixed(live < 1 ? 6 : 2));
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <PageHeader
        eyebrow="Tools"
        title="Profit / Loss Calculator"
        description="Calculate crypto returns — with leverage, fees, and liquidation price."
        actions={
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Inputs */}
        <SectionCard className="lg:col-span-3 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalcIcon className="h-5 w-5 text-amber-400" />
            <h3 className="font-semibold">Trade Setup</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Trading Pair</Label>
              <Select value={pair} onValueChange={setPair}>
                <SelectTrigger>
                  <SelectValue placeholder={symbols.length ? "Select pair" : "Loading…"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {symbols.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} <span className="text-muted-foreground ml-1">{currencySymbol(s)}{fmt(tickers[s]?.lastPrice ?? 0, 2)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {live > 0 && (
                <button
                  type="button"
                  onClick={useLivePrice}
                  className="text-[11px] text-amber-400 hover:underline mt-1"
                >
                  Use live price ({sym}{fmt(live, live < 1 ? 6 : 2)})
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide("long")}
                  className={`h-10 rounded-md text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                    side === "long"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
                      : "bg-muted/50 text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >
                  <TrendingUp className="h-4 w-4" /> Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide("short")}
                  className={`h-10 rounded-md text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                    side === "short"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/40"
                      : "bg-muted/50 text-muted-foreground border border-border hover:text-foreground"
                  }`}
                >
                  <TrendingDown className="h-4 w-4" /> Short
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Entry Price ({sym})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Exit Price ({sym})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={exit}
                onChange={(e) => setExit(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Margin / Capital ({sym})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="1000"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Leverage</Label>
              <Select value={String(leverage)} onValueChange={(v) => setLeverage(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10, 20, 25, 50, 75, 100].map((l) => (
                    <SelectItem key={l} value={String(l)}>{l}× {l === 1 && "(Spot)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Fees ka calculation 0.10% maker/taker rate par based hai. Liquidation price simplified hai — actual depends on maintenance margin & funding.
            </p>
          </div>
        </SectionCard>

        {/* Results */}
        <SectionCard className="lg:col-span-2 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5 text-amber-400" /> Result
            </h3>
            {calc && (
              <StatusPill variant={calc.netPnl >= 0 ? "success" : "danger"}>
                {calc.netPnl >= 0 ? "Profit" : "Loss"}
              </StatusPill>
            )}
          </div>

          {!calc ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Fill in all fields above to see the result.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                <PremiumStatCard
                  title="Net P&L (after fees)"
                  value={`${calc.netPnl >= 0 ? "+" : ""}${sym}${fmt(calc.netPnl, 2)}`}
                  icon={IndianRupee}
                  hint={`Gross: ${calc.pnl >= 0 ? "+" : ""}${sym}${fmt(calc.pnl, 2)}`}
                  accent={calc.netPnl >= 0}
                />
                <PremiumStatCard
                  title="Net ROI"
                  value={`${calc.netRoi >= 0 ? "+" : ""}${fmt(calc.netRoi, 2)}%`}
                  icon={Percent}
                  hint={`Gross: ${calc.roi >= 0 ? "+" : ""}${fmt(calc.roi, 2)}%`}
                  accent={calc.netRoi >= 0}
                />
              </div>
              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <Row label="Position Size" value={`${sym}${fmt(calc.positionValue, 2)}`} />
                <Row label="Quantity" value={fmt(calc.qty, calc.qty < 1 ? 6 : 4)} />
                <Row label="Estimated Fees" value={`${sym}${fmt(calc.fees, 2)}`} />
                {calc.liq && (
                  <Row
                    label="Liquidation Price"
                    value={`${sym}${fmt(calc.liq, calc.liq < 1 ? 6 : 2)}`}
                    danger
                  />
                )}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${danger ? "text-rose-400" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
