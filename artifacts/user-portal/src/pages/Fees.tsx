import { Link } from "wouter";
import {
  Receipt, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Star, Coins,
  IndianRupee, Sparkles, Info, ArrowRight, Award, Percent, BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SpotTier = { tier: string; vol30d: string; maker: string; taker: string; withdrawDiscount: string };
const SPOT_TIERS: SpotTier[] = [
  { tier: "Regular", vol30d: "< $100K",  maker: "0.20%",  taker: "0.25%",  withdrawDiscount: "0%" },
  { tier: "VIP 1",   vol30d: "≥ $100K",  maker: "0.16%",  taker: "0.20%",  withdrawDiscount: "5%" },
  { tier: "VIP 2",   vol30d: "≥ $500K",  maker: "0.12%",  taker: "0.15%",  withdrawDiscount: "10%" },
  { tier: "VIP 3",   vol30d: "≥ $2.5M",  maker: "0.08%",  taker: "0.10%",  withdrawDiscount: "15%" },
  { tier: "VIP 4",   vol30d: "≥ $10M",   maker: "0.06%",  taker: "0.08%",  withdrawDiscount: "20%" },
  { tier: "VIP 5",   vol30d: "≥ $50M",   maker: "0.04%",  taker: "0.06%",  withdrawDiscount: "25%" },
];

type FuturesTier = { tier: string; vol30d: string; maker: string; taker: string; maxLev: string };
const FUTURES_TIERS: FuturesTier[] = [
  { tier: "Regular", vol30d: "< $100K",  maker: "0.050%", taker: "0.070%", maxLev: "20×" },
  { tier: "VIP 1",   vol30d: "≥ $100K",  maker: "0.040%", taker: "0.060%", maxLev: "30×" },
  { tier: "VIP 2",   vol30d: "≥ $500K",  maker: "0.030%", taker: "0.050%", maxLev: "50×" },
  { tier: "VIP 3",   vol30d: "≥ $2.5M",  maker: "0.020%", taker: "0.040%", maxLev: "75×" },
  { tier: "VIP 4",   vol30d: "≥ $10M",   maker: "0.015%", taker: "0.030%", maxLev: "100×" },
  { tier: "VIP 5",   vol30d: "≥ $50M",   maker: "0.010%", taker: "0.025%", maxLev: "125×" },
];

type FundingItem = { asset: string; network: string; depositFee: string; withdrawFee: string; minWithdraw: string };
const FUNDING_TABLE: FundingItem[] = [
  { asset: "INR (UPI)",   network: "UPI", depositFee: "Free (≤ ₹5,000) / 0.50% (above)", withdrawFee: "₹15 flat", minWithdraw: "₹100" },
  { asset: "INR (IMPS)",  network: "IMPS", depositFee: "Free", withdrawFee: "₹10 flat", minWithdraw: "₹100" },
  { asset: "INR (NEFT)",  network: "NEFT", depositFee: "Free", withdrawFee: "Free", minWithdraw: "₹500" },
  { asset: "USDT",        network: "TRC-20",  depositFee: "Free", withdrawFee: "1 USDT",     minWithdraw: "10 USDT" },
  { asset: "USDT",        network: "ERC-20",  depositFee: "Free", withdrawFee: "5 USDT",     minWithdraw: "20 USDT" },
  { asset: "USDT",        network: "BEP-20",  depositFee: "Free", withdrawFee: "0.30 USDT",  minWithdraw: "10 USDT" },
  { asset: "USDT",        network: "Zebvix L1",depositFee: "Free", withdrawFee: "0.10 USDT", minWithdraw: "1 USDT" },
  { asset: "BTC",         network: "Bitcoin",  depositFee: "Free", withdrawFee: "0.0002 BTC",minWithdraw: "0.001 BTC" },
  { asset: "ETH",         network: "ERC-20",   depositFee: "Free", withdrawFee: "0.003 ETH", minWithdraw: "0.01 ETH" },
  { asset: "ETH",         network: "Zebvix L1",depositFee: "Free", withdrawFee: "0.0005 ETH",minWithdraw: "0.005 ETH" },
  { asset: "BNB",         network: "BEP-20",   depositFee: "Free", withdrawFee: "0.0008 BNB",minWithdraw: "0.01 BNB" },
  { asset: "SOL",         network: "Solana",   depositFee: "Free", withdrawFee: "0.01 SOL",  minWithdraw: "0.05 SOL" },
  { asset: "ZBX",         network: "Zebvix L1",depositFee: "Free", withdrawFee: "0.50 ZBX",  minWithdraw: "5 ZBX" },
];

const DISCOUNTS = [
  { icon: Coins, title: "Pay fees in ZBX (Coming Soon)", body: "ZBX fee discounts are coming in a future update. Hold ZBX now to qualify when the feature launches." },
  { icon: Sparkles, title: "First-week welcome", body: "0% spot maker/taker fees on your first ₹50,000 of trading volume in your first 7 days." },
  { icon: Award, title: "VIP tier upgrades", body: "Tiers are recalculated daily at 00:00 IST based on rolling 30-day USD-equivalent volume. Higher VIP tiers also get withdrawal fee discounts (5%–25%)." },
  { icon: BadgeCheck, title: "Referral kick-back", body: "Earn up to 30% of fees paid by users you refer across 5 levels, instantly credited as USDT to your spot wallet." },
];

export default function Fees() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-fees">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-amber-500/10 via-card to-card p-8 md:p-12 mb-10 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-3 bg-background/50">
            <Receipt className="h-3 w-3 mr-1.5 text-primary" /> Fee Schedule
          </Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
            Transparent fees.{" "}
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              No surprises.
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-5">
            Every trading fee, deposit fee, withdrawal fee, and discount on
            Zebvix — published in one place. Updated{" "}
            <strong className="text-foreground">26 April 2026</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary"><Percent className="h-3 w-3 mr-1" /> Spot from 0.04% maker (VIP 5)</Badge>
            <Badge variant="secondary"><Percent className="h-3 w-3 mr-1" /> Futures from 0.010% maker (VIP 5)</Badge>
            <Badge variant="secondary"><IndianRupee className="h-3 w-3 mr-1" /> Free NEFT in / out</Badge>
            <Badge variant="secondary"><Award className="h-3 w-3 mr-1" /> Up to 25% withdraw discount (VIP 5)</Badge>
          </div>
        </div>
      </section>

      <Tabs defaultValue="spot" className="w-full">
        <div className="overflow-x-auto -mx-1 px-1 mb-8">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl min-w-[22rem]">
            <TabsTrigger value="spot" data-testid="tab-fees-spot"><TrendingUp className="h-4 w-4 mr-1.5" />Spot</TabsTrigger>
            <TabsTrigger value="futures" data-testid="tab-fees-futures"><TrendingUp className="h-4 w-4 mr-1.5" />Futures</TabsTrigger>
            <TabsTrigger value="funding" data-testid="tab-fees-funding"><ArrowDownToLine className="h-4 w-4 mr-1.5" />Funding</TabsTrigger>
            <TabsTrigger value="discounts" data-testid="tab-fees-discounts"><Star className="h-4 w-4 mr-1.5" />Discounts</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Spot ─────────────────────────── */}
        <TabsContent value="spot" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-border">
                <h2 className="text-lg font-bold">Spot trading — maker / taker</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Tier is based on your rolling 30-day USD-equivalent trading volume, recalculated daily at 00:00 IST.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left font-semibold px-4 py-3">Tier</th>
                      <th className="text-left font-semibold px-4 py-3">30-day volume</th>
                      <th className="text-right font-semibold px-4 py-3">Maker</th>
                      <th className="text-right font-semibold px-4 py-3">Taker</th>
                      <th className="text-right font-semibold px-4 py-3">Withdraw discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {SPOT_TIERS.map((t) => (
                      <tr key={t.tier} className="hover:bg-accent/20" data-testid={`row-spot-${t.tier.toLowerCase().replace(/\s+/g, "-")}`}>
                        <td className="px-4 py-3 font-semibold">{t.tier}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.vol30d}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono">{t.maker}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono">{t.taker}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.withdrawDiscount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/40">
            <CardContent className="p-5 flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Conversion (instant buy/sell):</strong>{" "}
                a market spread of <strong>~0.10%</strong> is baked into the displayed rate, plus a
                conversion fee of <strong>0.075%–0.30%</strong> (depending on your VIP tier) on the output amount.
                No separate maker/taker fee applies to Convert orders.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Futures ───────────────────────── */}
        <TabsContent value="futures" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-border">
                <h2 className="text-lg font-bold">Perpetual futures — maker / taker</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Margin: cross or isolated. Funding paid every 8 hours
                  between longs and shorts (variable rate).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left font-semibold px-4 py-3">Tier</th>
                      <th className="text-left font-semibold px-4 py-3">30-day volume</th>
                      <th className="text-right font-semibold px-4 py-3">Maker</th>
                      <th className="text-right font-semibold px-4 py-3">Taker</th>
                      <th className="text-right font-semibold px-4 py-3">Max leverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {FUTURES_TIERS.map((t) => (
                      <tr key={t.tier} className="hover:bg-accent/20">
                        <td className="px-4 py-3 font-semibold">{t.tier}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.vol30d}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono">{t.maker}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono">{t.taker}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{t.maxLev}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/40">
            <CardContent className="p-5 flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Liquidation fee:</strong>{" "}
                0.30% of the notional liquidated. <strong className="text-foreground">Insurance fund</strong> contributions
                may apply during periods of severe market stress.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Funding ───────────────────────── */}
        <TabsContent value="funding" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="p-5 border-b border-border">
                <h2 className="text-lg font-bold">Deposits & withdrawals</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Crypto withdrawal fees are pass-through network fees + a
                  small handling fee. INR rails settle through licensed
                  Indian banking partners.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left font-semibold px-4 py-3">Asset</th>
                      <th className="text-left font-semibold px-4 py-3">Network</th>
                      <th className="text-left font-semibold px-4 py-3">Deposit</th>
                      <th className="text-left font-semibold px-4 py-3">Withdraw</th>
                      <th className="text-left font-semibold px-4 py-3">Min withdraw</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {FUNDING_TABLE.map((f, i) => (
                      <tr key={i} className="hover:bg-accent/20">
                        <td className="px-4 py-3 font-semibold">{f.asset}</td>
                        <td className="px-4 py-3 text-muted-foreground">{f.network}</td>
                        <td className="px-4 py-3 text-muted-foreground">{f.depositFee}</td>
                        <td className="px-4 py-3 font-mono text-xs">{f.withdrawFee}</td>
                        <td className="px-4 py-3 font-mono text-xs">{f.minWithdraw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="bg-card/40">
              <CardContent className="p-5">
                <ArrowDownToLine className="h-5 w-5 text-success mb-2" />
                <div className="font-semibold mb-1">Deposit limits</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  KYC L1: ₹50,000 / day · L2: ₹10L / day · L3: case-by-case.
                  Crypto deposits are unlimited; subject to source-of-funds review.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/40">
              <CardContent className="p-5">
                <ArrowUpFromLine className="h-5 w-5 text-amber-400 mb-2" />
                <div className="font-semibold mb-1">Withdrawal limits</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  KYC L1: ₹25,000 / day · L2: ₹5L / day · L3: ₹50L / day. Higher
                  limits via Enhanced Due Diligence.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Discounts ─────────────────────── */}
        <TabsContent value="discounts" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            {DISCOUNTS.map((d) => (
              <Card key={d.title} className="bg-card/40 border-border hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <d.icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold mb-1">{d.title}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{d.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/30">
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
              <div>
                <div className="font-semibold mb-1">Want institutional pricing?</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Trading more than $50M / month? We offer custom maker
                  rebates, dedicated support, and colocation options.
                </p>
              </div>
              <Link href="/support">
                <Button data-testid="button-fees-contact-sales" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap">
                  Talk to sales <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground mt-10 leading-relaxed">
        Fees and limits may change from time to time. Material changes are
        announced in-app and via email at least 7 days in advance. All fees
        are exclusive of applicable GST, where chargeable.
      </p>
    </div>
  );
}
