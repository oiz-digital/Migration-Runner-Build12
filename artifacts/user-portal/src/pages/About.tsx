import { Link } from "wouter";
import {
  ShieldCheck,
  Cpu,
  Globe2,
  Users,
  TrendingUp,
  Lock,
  Award,
  Building2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Coins,
  Network,
  Layers,
  Zap,
  HeartHandshake,
  Linkedin,
  Twitter,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type TeamMember = {
  id: number; name: string; title: string; bio: string;
  avatarUrl: string; linkedinUrl: string; twitterUrl: string;
  displayOrder: number; isVisible: boolean;
};
type CompanyMedia = {
  id: number; category: string; title: string; caption: string;
  url: string; displayOrder: number; isActive: boolean;
};

const STATS = [
  { label: "Registered users", value: "2.4M+" },
  { label: "24h trading volume", value: "₹15,000 Cr+" },
  { label: "Supported assets", value: "320+" },
  { label: "Countries served", value: "150+" },
];

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Security first",
    body: "ISO 27001 + SOC 2 Type II controls, 95% of user funds in cold storage with multi-sig & geographic redundancy, and a $250M insurance cover for hot wallets.",
  },
  {
    icon: Cpu,
    title: "Built on Zebvix L1",
    body: "Our own EVM-compatible Layer 1 (chain id 8989 / 0x231d) settles trades in 1.2s with sub-cent fees. ZBX is the native gas token; ZBX-20 is the smart-contract token standard.",
  },
  {
    icon: Globe2,
    title: "Made in India, built for the world",
    body: "FIU-IND registered Reporting Entity under PMLA 2002. Native INR rails (UPI, IMPS, NEFT) for the Indian market, with global access in 150+ countries.",
  },
  {
    icon: HeartHandshake,
    title: "User-aligned",
    body: "Transparent fee schedule, instant referral payouts, and a Proof-of-Reserves report published every 30 days so you can verify we hold what we owe — independently.",
  },
];

const TIMELINE = [
  { year: "2026", title: "Incorporated in India", body: "Zebvix Technologies Private Limited incorporated on 10 April 2026 under the Companies Act, 2013 — building a regulated, India-first crypto exchange." },
  { year: "2022", title: "Series A — $32M", body: "Led by tier-1 funds. Hired our compliance, custody and matching-engine cores." },
  { year: "2023", title: "Zebvix L1 mainnet launch", body: "Our purpose-built EVM L1 went live with sub-second finality. ZBX TGE in Q4." },
  { year: "2024", title: "Spot + Perpetual futures", body: "0.10% maker/taker spot fees, 50× leverage perps, native USDT futures wallets." },
  { year: "2025", title: "FIU-IND Reporting Entity", body: "Officially registered under the Prevention of Money Laundering Act, 2002." },
  { year: "2026", title: "Earn, Bridge, Native DEX", body: "Flexible & locked Earn products, ZBX <> ETH/BNB/SOL bridge, and a native AMM DEX on Zebvix L1." },
];

const STACK = [
  { icon: Lock, title: "Cold storage", body: "MPC + multi-sig vaults across multiple jurisdictions." },
  { icon: Network, title: "On-chain monitoring", body: "Real-time TRM Labs / Chainalysis screening on every deposit & withdrawal." },
  { icon: Layers, title: "Matching engine", body: "Custom Go engine, sub-millisecond order matching, audited orderbook." },
  { icon: Zap, title: "Risk engine", body: "Pre-trade margin checks, dynamic liquidation buffers, circuit-breakers on extreme moves." },
];

const VALUES = [
  { title: "Transparency", body: "Monthly Proof-of-Reserves, public fee schedule, no hidden spreads." },
  { title: "Compliance", body: "Built around PMLA 2002, FIU-IND guidance, RBI advisories and the DPDP Act 2023." },
  { title: "Performance", body: "Trading should never feel slow. Our L1 + matching engine target 99.99% uptime." },
  { title: "Education", body: "We invest in user education — what crypto is, what the risks are, how to protect yourself." },
];

function TeamSection() {
  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ["public", "team"],
    queryFn: () => get<TeamMember[]>("/company/team"),
    staleTime: 5 * 60 * 1000,
  });
  if (members.length === 0) return null;
  return (
    <section className="mb-16">
      <Badge variant="outline" className="mb-3"><Users className="h-3 w-3 mr-1.5" /> The people behind Zebvix</Badge>
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-8">Meet the team</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {members.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card/40 p-5 text-center flex flex-col items-center">
            <Avatar className="w-16 h-16 mb-3">
              {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.name} />}
              <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                {m.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="font-semibold text-sm">{m.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 mb-2">{m.title}</div>
            {m.bio && <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-3 mb-3">{m.bio}</p>}
            <div className="flex items-center gap-2 mt-auto">
              {m.linkedinUrl && (
                <a href={m.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
              {m.twitterUrl && (
                <a href={m.twitterUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <Twitter className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompanyGallery() {
  const { data: media = [] } = useQuery<CompanyMedia[]>({
    queryKey: ["public", "company-media"],
    queryFn: () => get<CompanyMedia[]>("/company/media"),
    staleTime: 5 * 60 * 1000,
  });
  if (media.length === 0) return null;
  return (
    <section className="mb-16">
      <Badge variant="outline" className="mb-3"><Building2 className="h-3 w-3 mr-1.5" /> Life at Zebvix</Badge>
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-8">Our workplace</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {media.map((m) => (
          <div key={m.id} className="rounded-xl overflow-hidden border border-border bg-card/30 group">
            <div className="aspect-video overflow-hidden">
              <img
                src={m.url}
                alt={m.title || m.caption || m.category}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            {(m.title || m.caption) && (
              <div className="px-3 py-2">
                {m.title && <div className="text-xs font-medium">{m.title}</div>}
                {m.caption && <div className="text-xs text-muted-foreground mt-0.5">{m.caption}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function About() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-about">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-amber-500/10 via-card to-card p-8 md:p-14 mb-12 overflow-hidden relative">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-4 bg-background/50">
            <Sparkles className="h-3 w-3 mr-1.5 text-primary" /> About Zebvix Exchange
          </Badge>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05] mb-5">
            India's pro-grade crypto exchange,{" "}
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              built on its own L1
            </span>
            .
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-7">
            Zebvix is a regulated, India-first digital-asset exchange. We give traders
            and investors institutional-grade tools — spot, perpetual futures, Earn
            products, and a native L1 blockchain — wrapped in a clean, accountable,
            compliance-first product.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-about-signup">
                Create free account <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/markets">
              <Button size="lg" variant="outline" data-testid="button-about-markets">
                Explore markets
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 relative">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-background/40 backdrop-blur-sm p-4">
              <div className="text-2xl md:text-3xl font-extrabold tracking-tight">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Mission ──────────────────────────────────────────── */}
      <section className="grid md:grid-cols-12 gap-8 mb-16">
        <div className="md:col-span-5">
          <Badge variant="outline" className="mb-3">Our mission</Badge>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Make crypto trustworthy for the next billion users.
          </h2>
        </div>
        <div className="md:col-span-7 text-muted-foreground space-y-4 leading-relaxed">
          <p>
            Crypto's promise — open, programmable, global money — only matters if the
            on-ramp is safe and trustworthy. Most users don't want to think about cold
            wallets, gas tokens, or settlement risk. They want a platform that just
            works, follows the law, and treats their money with the seriousness it
            deserves.
          </p>
          <p>
            Zebvix exists to be that platform for India and the world. We obsess over
            three things: <strong className="text-foreground">security</strong>,{" "}
            <strong className="text-foreground">performance</strong>, and{" "}
            <strong className="text-foreground">compliance</strong>. Every feature we
            ship is measured against those three pillars.
          </p>
        </div>
      </section>

      {/* ── Pillars ──────────────────────────────────────────── */}
      <section className="mb-16">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-6">
          What makes Zebvix different
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          {PILLARS.map((p) => (
            <Card key={p.title} className="bg-card/40 border-border hover:border-primary/40 transition-colors">
              <CardContent className="p-6">
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Security stack ───────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card/30 p-6 md:p-10 mb-16">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <Badge variant="outline" className="mb-3"><ShieldCheck className="h-3 w-3 mr-1.5" /> Security stack</Badge>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Bank-grade controls. Crypto-native execution.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary"><Award className="h-3 w-3 mr-1" /> ISO 27001</Badge>
            <Badge variant="secondary"><Award className="h-3 w-3 mr-1" /> SOC 2 Type II</Badge>
            <Badge variant="secondary"><Award className="h-3 w-3 mr-1" /> FIU-IND</Badge>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STACK.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-background/40 p-5">
              <s.icon className="h-5 w-5 text-primary mb-3" />
              <div className="font-semibold mb-1">{s.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Timeline ─────────────────────────────────────────── */}
      <section className="mb-16">
        <Badge variant="outline" className="mb-3"><TrendingUp className="h-3 w-3 mr-1.5" /> Our journey</Badge>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-8">
          From idea to L1 in five years.
        </h2>
        <ol className="relative border-l-2 border-border/60 ml-3 space-y-7">
          {TIMELINE.map((t) => (
            <li key={t.year} className="pl-6 relative">
              <span className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full bg-primary ring-4 ring-background" />
              <div className="text-xs font-bold tracking-widest text-primary mb-1">{t.year}</div>
              <div className="font-semibold">{t.title}</div>
              <div className="text-sm text-muted-foreground mt-1 max-w-2xl">{t.body}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Values ───────────────────────────────────────────── */}
      <section className="mb-16">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-6">What we stand for</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-xl border border-border bg-card/40 p-5">
              <CheckCircle2 className="h-5 w-5 text-success mb-3" />
              <div className="font-semibold mb-1">{v.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{v.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Company ──────────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-6 mb-16">
        <Card className="bg-card/40">
          <CardContent className="p-6">
            <Building2 className="h-5 w-5 text-primary mb-3" />
            <div className="font-semibold mb-1">Registered entity</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Zebvix Technologies Private Limited<br />
              CIN: U66190UW2026PTC251591<br />
              PAN: AACCZ9728R<br />
              Registered office: 105 Vill Subari, Shamli, Jhinjhana,<br />
              Kairana, Muzaffarnagar — 247773, Uttar Pradesh, India<br />
              Incorporated: 10 April 2026<br />
              FIU-IND Reporting Entity: Registration pending
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardContent className="p-6">
            <Coins className="h-5 w-5 text-primary mb-3" />
            <div className="font-semibold mb-1">Zebvix L1 chain</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              EVM-compatible Layer 1<br />
              Chain ID: 8989 (0x231d)<br />
              Native token: ZBX · Token standard: ZBX-20<br />
              Avg block time: 1.2s · Public RPC available
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Team ─────────────────────────────────────────────── */}
      <TeamSection />

      {/* ── Company Gallery ──────────────────────────────────── */}
      <CompanyGallery />

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-8 md:p-12 text-center">
        <Users className="h-10 w-10 text-primary mx-auto mb-4" />
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3">
          Trade with a team that takes your money seriously.
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
          Open a free account in under 5 minutes. KYC L1 is instant — start
          trading spot or futures the same day.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/signup">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-about-cta-signup">
              Create your account <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          <Link href="/support">
            <Button size="lg" variant="outline" data-testid="button-about-cta-support">
              Talk to support
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
