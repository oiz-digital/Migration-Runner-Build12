import { useEffect, useMemo, useState } from "react";
import {
  Activity, CheckCircle2, AlertTriangle, AlertCircle, Wrench,
  Globe, Zap, ArrowDownToLine, ArrowUpFromLine, IndianRupee,
  Webhook, ShieldCheck, Smartphone, Calendar, Clock, RefreshCw, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type State = "operational" | "degraded" | "outage" | "maintenance";

const STATE_META: Record<State, { label: string; color: string; bg: string; ring: string; Icon: typeof CheckCircle2 }> = {
  operational: { label: "Operational",        color: "text-success",   bg: "bg-success/15",  ring: "ring-success/30",  Icon: CheckCircle2 },
  degraded:    { label: "Degraded performance", color: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-500/30", Icon: AlertTriangle },
  outage:      { label: "Major outage",       color: "text-destructive", bg: "bg-destructive/15", ring: "ring-destructive/30", Icon: AlertCircle },
  maintenance: { label: "Under maintenance",  color: "text-sky-400",   bg: "bg-sky-500/15",   ring: "ring-sky-500/30",   Icon: Wrench },
};

type Component = {
  id: string;
  name: string;
  icon: typeof Globe;
  description: string;
  state: State;
  uptime: number;
};

const COMPONENTS: Component[] = [
  { id: "website",     name: "Website (zebvix.com)",          icon: Globe,            description: "Marketing site, sign-up & login pages.",        state: "operational", uptime: 99.998 },
  { id: "spot",        name: "Spot trading engine",            icon: Zap,              description: "Orderbook, matching, market data feeds.",       state: "operational", uptime: 99.997 },
  { id: "futures",     name: "Perpetual futures engine",       icon: Activity,         description: "Cross / isolated margin, liquidations, funding.", state: "operational", uptime: 99.985 },
  { id: "rest-api",    name: "REST API",                       icon: Globe,            description: "https://api.zebvix.com/v1",                     state: "operational", uptime: 99.992 },
  { id: "websocket",   name: "WebSocket streams",              icon: Webhook,          description: "wss://stream.zebvix.com/ws",                    state: "operational", uptime: 99.990 },
  { id: "deposits-crypto", name: "Crypto deposits & withdrawals", icon: ArrowDownToLine, description: "All supported networks (BTC, ETH, USDT, …).",   state: "operational", uptime: 99.980 },
  { id: "deposits-inr", name: "INR rails (UPI / IMPS / NEFT)", icon: IndianRupee,      description: "Indian banking partner connectivity.",          state: "degraded",    uptime: 99.821 },
  { id: "withdrawals", name: "Withdrawal processing",          icon: ArrowUpFromLine,  description: "Risk review + on-chain broadcast.",             state: "operational", uptime: 99.991 },
  { id: "kyc",         name: "KYC & onboarding",               icon: ShieldCheck,      description: "PAN, Aadhaar, document review pipeline.",       state: "operational", uptime: 99.970 },
  { id: "mobile",      name: "iOS & Android apps",             icon: Smartphone,       description: "Latest store builds + crash-free sessions.",    state: "operational", uptime: 99.995 },
];

type Severity = "minor" | "major" | "critical" | "maintenance";

type Incident = {
  id: string;
  date: string;
  title: string;
  severity: Severity;
  resolved: boolean;
  components: string[];
  updates: { ts: string; status: string; body: string }[];
};

const INCIDENTS: Incident[] = [
  {
    id: "inc-2026-04-26-01",
    date: "26 April 2026",
    title: "Slower-than-usual UPI deposit credits",
    severity: "minor",
    resolved: false,
    components: ["INR rails (UPI / IMPS / NEFT)"],
    updates: [
      { ts: "11:42 IST", status: "Investigating",  body: "We're seeing UPI deposit confirmations queueing 3–8 minutes behind normal at one banking partner. IMPS and NEFT are unaffected. Withdrawals normal." },
      { ts: "12:05 IST", status: "Identified",     body: "Issue traced to a settlement-batch delay at the partner bank. They are working on resolution. We will continue to credit deposits as confirmations arrive." },
    ],
  },
  {
    id: "inc-2026-04-22-01",
    date: "22 April 2026",
    title: "Brief degradation of futures market-data WebSocket",
    severity: "minor",
    resolved: true,
    components: ["WebSocket streams", "Perpetual futures engine"],
    updates: [
      { ts: "07:18 IST", status: "Investigating", body: "Some futures clients reported missed order-book deltas after a routine deploy." },
      { ts: "07:34 IST", status: "Identified",    body: "A misconfigured load-balancer rule was dropping ~0.5% of WS frames. Configuration reverted." },
      { ts: "07:51 IST", status: "Resolved",      body: "All WS streams confirmed healthy for 15 minutes. Trading was unaffected — REST and order placement remained nominal throughout." },
    ],
  },
  {
    id: "inc-2026-04-15-01",
    date: "15 April 2026",
    title: "Scheduled maintenance — futures engine v2.3 rollout",
    severity: "maintenance",
    resolved: true,
    components: ["Perpetual futures engine"],
    updates: [
      { ts: "02:00 IST", status: "Scheduled", body: "Futures engine paused for 12 minutes for a planned rollout. Spot trading and deposits unaffected." },
      { ts: "02:09 IST", status: "Completed", body: "Engine restored ahead of schedule. New features: improved liquidation pricing and reduced latency under load." },
    ],
  },
  {
    id: "inc-2026-04-08-01",
    date: "08 April 2026",
    title: "Withdrawals on Solana network paused",
    severity: "major",
    resolved: true,
    components: ["Crypto deposits & withdrawals"],
    updates: [
      { ts: "14:21 IST", status: "Investigating", body: "Solana mainnet is experiencing widespread degradation. We have paused SOL and SPL token withdrawals to protect funds." },
      { ts: "16:55 IST", status: "Monitoring",   body: "Solana validators have stabilised. We are slowly re-enabling withdrawals in batches." },
      { ts: "18:10 IST", status: "Resolved",     body: "All Solana withdrawals processed. Future Solana incidents will be communicated proactively via in-app notifications." },
    ],
  },
];

const SCHEDULED = [
  { date: "30 April 2026 · 02:00–02:30 IST", title: "Database failover drill", body: "We will fail over the primary OLTP database to the standby. Read-only mode for ~5 minutes; trading and order placement will be paused." },
  { date: "07 May 2026 · 03:00–03:20 IST",   title: "Spot engine deploy v4.7", body: "Improved order-cancellation latency and a new TWAP order type. Brief 60-second pause expected during cut-over." },
];

const SEVERITY_BADGE: Record<Severity, string> = {
  minor:       "bg-amber-500/15 text-amber-400 border-amber-500/30",
  major:       "bg-rose-500/15 text-rose-400 border-rose-500/30",
  critical:    "bg-rose-600/20 text-rose-300 border-rose-600/40",
  maintenance: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

function uptimeBars(seed: number, current: State) {
  const bars: { state: State }[] = [];
  for (let i = 0; i < 90; i++) {
    const r = Math.sin(seed * 9301 + i * 49297) * 0.5 + 0.5;
    let s: State = "operational";
    if (i === 89 && current !== "operational") s = current;
    else if (r > 0.985) s = "degraded";
    else if (r > 0.998) s = "outage";
    bars.push({ state: s });
  }
  return bars;
}

const BAR_COLOR: Record<State, string> = {
  operational: "bg-success/80",
  degraded:    "bg-amber-500/80",
  outage:      "bg-destructive/80",
  maintenance: "bg-sky-500/80",
};

export default function Status() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [now, setNow] = useState(new Date());
  const [email, setEmail] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const overall: State = useMemo(() => {
    if (COMPONENTS.some((c) => c.state === "outage")) return "outage";
    if (COMPONENTS.some((c) => c.state === "maintenance")) return "maintenance";
    if (COMPONENTS.some((c) => c.state === "degraded")) return "degraded";
    return "operational";
  }, []);
  const meta = STATE_META[overall];
  const Icon = meta.Icon;

  const onSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Invalid email");
      return;
    }
    toast.success(`Status updates will be emailed to ${email}.`);
    setEmail("");
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl" data-testid="page-status">
      {/* Overall */}
      <section className={`rounded-2xl border border-border ${meta.bg} ring-1 ${meta.ring} p-6 md:p-8 mb-8`}>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-start gap-4">
            <div className={`h-14 w-14 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center flex-shrink-0 ring-1 ${meta.ring}`}>
              <Icon className="h-7 w-7" />
            </div>
            <div>
              <Badge variant="outline" className="mb-2 bg-background/60">
                <Activity className="h-3 w-3 mr-1.5 text-primary" /> System Status
              </Badge>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                {overall === "operational"
                  ? "All systems operational"
                  : overall === "degraded"
                    ? "Some systems are experiencing degraded performance"
                    : overall === "maintenance"
                      ? "Scheduled maintenance in progress"
                      : "We are investigating an outage"}
              </h1>
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Last updated {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })} IST
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => { setRefreshTick((t) => t + 1); setNow(new Date()); toast.info("Status pulled from health-check pipeline."); }}
            data-testid="button-status-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </section>

      {/* Components */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold tracking-tight">Components</h2>
          <span className="text-xs text-muted-foreground">90-day uptime per component</span>
        </div>
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden divide-y divide-border">
          {COMPONENTS.map((c, ci) => {
            const cMeta = STATE_META[c.state];
            const bars = uptimeBars(ci + refreshTick * 7, c.state);
            return (
              <div key={c.id} className="p-4 md:p-5" data-testid={`row-status-${c.id}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`h-9 w-9 rounded-lg ${cMeta.bg} ${cMeta.color} flex items-center justify-center flex-shrink-0`}>
                      <c.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs font-medium ${cMeta.color}`}>{cMeta.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">
                      {c.uptime.toFixed(3)}%
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-[2px] h-7">
                  {bars.map((b, i) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-sm ${BAR_COLOR[b.state]} hover:opacity-80 transition-opacity`}
                      style={{ height: b.state === "operational" ? "100%" : "85%" }}
                      title={b.state}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>90 days ago</span>
                  <span>Today</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Scheduled maintenance */}
      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">Scheduled maintenance</h2>
        <div className="space-y-3">
          {SCHEDULED.map((s) => (
            <Card key={s.title} className="bg-card/40 border-l-4 border-l-sky-500/60">
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                  <h3 className="font-semibold">{s.title}</h3>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> {s.date}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Incidents */}
      <section className="mb-10">
        <h2 className="text-xl font-bold tracking-tight mb-4">Recent incidents</h2>
        <div className="space-y-4">
          {INCIDENTS.map((inc) => (
            <Card key={inc.id} className={`bg-card/40 border-l-4 ${
              inc.severity === "critical" || inc.severity === "major"
                ? "border-l-rose-500/70"
                : inc.severity === "minor"
                  ? "border-l-amber-500/70"
                  : "border-l-sky-500/60"
            }`}>
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">{inc.title}</h3>
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_BADGE[inc.severity]}`}>
                      {inc.severity}
                    </Badge>
                    {inc.resolved && (
                      <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-shrink-0">
                    <Calendar className="h-3 w-3" /> {inc.date}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mb-3">
                  Affects: {inc.components.join(" · ")}
                </div>
                <ol className="space-y-2 border-l border-border pl-4">
                  {inc.updates.map((u, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-muted-foreground">{u.ts}</span>
                        <span className="font-semibold text-foreground">{u.status}</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed mt-0.5">{u.body}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Subscribe */}
      <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/30">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="flex items-start gap-4 max-w-xl">
              <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold text-lg mb-1">Get status updates</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Email alerts for incidents and scheduled maintenance.
                  We only email when something is happening — no
                  marketing.
                </p>
              </div>
            </div>
            <form onSubmit={onSubscribe} className="flex w-full md:w-auto gap-2 flex-shrink-0">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="md:w-64"
                data-testid="input-status-email"
              />
              <Button type="submit" data-testid="button-status-subscribe" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap">
                Subscribe
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
