import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import {
  Server, Database, Wifi, Clock, Cpu, RefreshCw, HardDrive, Activity,
  CheckCircle2, XCircle, AlertCircle, Layers, Zap, MemoryStick,
  GitBranch, Timer, Shield, Power, Terminal, BookOpen,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from "recharts";
import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";

interface SystemStatus {
  timestamp: string;
  services: {
    database:  { status: string; latencyMs?: number; version?: string };
    redis:     { status: string; latencyMs?: number; connectedClients?: number; usedMemoryHuman?: string; version?: string };
    goService: { status: string; latencyMs?: number; books?: number; port?: string };
    process:   {
      status: string; uptimeSecs: number; uptimeHuman: string;
      memMb: number; pid: number; nodeVersion: string;
      heapUsedMb?: number; heapTotalMb?: number;
    };
  };
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function fmtUptime(secs: number) {
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${secs % 60}s`;
}

export default function SystemStatus() {
  const [memHistory, setMemHistory] = useState<{ t: string; mem: number; heap: number }[]>([]);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusQ = useQuery<SystemStatus>({
    queryKey: ["admin-system-status"],
    queryFn: () => get<SystemStatus>("/admin/system-status"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const s = statusQ.data?.services;

  useEffect(() => {
    if (!s?.process) return;
    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setMemHistory(prev => {
      const next = [...prev, { t: now, mem: s.process.memMb, heap: s.process.heapUsedMb ?? 0 }];
      return next.slice(-20);
    });
  }, [s?.process?.memMb]);

  const heapPct = useMemo(() => {
    if (!s?.process?.heapUsedMb || !s?.process?.heapTotalMb) return 0;
    return Math.round((s.process.heapUsedMb / s.process.heapTotalMb) * 100);
  }, [s?.process]);

  const dbOk    = s?.database?.status === "ok";
  const redisOk = s?.redis?.status === "ok";
  const procOk  = s?.process?.status === "ok";
  const goOk    = s?.goService?.status === "ok";
  const allOk   = dbOk && redisOk && procOk;

  async function handleRestart() {
    setRestarting(true);
    try {
      await post("/admin/restart", {});
      toast.success("Restart initiated — server will be back in ~5 seconds");
      // Wait 6s then re-poll
      setTimeout(() => {
        statusQ.refetch();
        setRestarting(false);
        setConfirmRestart(false);
      }, 6000);
    } catch {
      toast.error("Restart request failed");
      setRestarting(false);
      setConfirmRestart(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        eyebrow="Infrastructure"
        title="System Status"
        description="Live health monitoring — database, Redis cache, Go matching engine, and API process."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {statusQ.data && (
              <span className="text-xs text-muted-foreground">
                Updated {relTime(statusQ.data.timestamp)}
              </span>
            )}
            <button
              onClick={() => statusQ.refetch()}
              disabled={statusQ.isFetching}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/80 px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={statusQ.isFetching ? "animate-spin" : ""} />
              Refresh
            </button>
            {!confirmRestart ? (
              <button
                onClick={() => setConfirmRestart(true)}
                className="flex items-center gap-2 text-sm text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-500/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Power size={14} />
                Restart API
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-medium">Confirm restart?</span>
                <button
                  onClick={handleRestart}
                  disabled={restarting}
                  className="flex items-center gap-1.5 text-sm bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                >
                  {restarting ? <RefreshCw size={13} className="animate-spin" /> : <Power size={13} />}
                  {restarting ? "Restarting…" : "Yes, Restart"}
                </button>
                <button
                  onClick={() => setConfirmRestart(false)}
                  className="text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            <StatusPill variant={allOk ? "success" : "warning"} dot>
              {allOk ? "All systems operational" : "Attention required"}
            </StatusPill>
          </div>
        }
      />

      {/* ─── Process KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          hero
          title="Uptime"
          value={s ? fmtUptime(s.process.uptimeSecs) : "—"}
          icon={Timer}
          loading={statusQ.isLoading}
          hint={s?.process.nodeVersion ? `Node.js ${s.process.nodeVersion}` : "Process uptime"}
        />
        <PremiumStatCard
          title="Memory (RSS)"
          value={s ? `${s.process.memMb} MB` : "—"}
          icon={MemoryStick}
          loading={statusQ.isLoading}
          hint={s?.process.heapUsedMb ? `Heap: ${s.process.heapUsedMb?.toFixed(0)} / ${s.process.heapTotalMb?.toFixed(0)} MB` : "Resident set size"}
        />
        <PremiumStatCard
          title="Process ID"
          value={s ? String(s.process.pid) : "—"}
          icon={GitBranch}
          loading={statusQ.isLoading}
          hint="Current Node.js PID"
        />
        <PremiumStatCard
          title="Heap Usage"
          value={s?.process.heapUsedMb ? `${heapPct}%` : "—"}
          icon={Cpu}
          loading={statusQ.isLoading}
          hint={s?.process.heapUsedMb ? `${s.process.heapUsedMb.toFixed(0)} MB used of ${s.process.heapTotalMb?.toFixed(0)} MB` : "V8 heap utilization"}
        />
      </div>

      {/* ─── Service cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ServiceCard
          icon={Database}
          label="PostgreSQL"
          sub={s?.database?.version ? `v${s.database.version} · Drizzle ORM` : "Drizzle ORM · Primary DB"}
          status={s?.database?.status ?? "unknown"}
          ok={dbOk}
          loading={statusQ.isLoading}
          metrics={[
            { label: "Latency", value: s?.database?.latencyMs != null ? `${s.database.latencyMs}ms` : "—" },
            { label: "Driver", value: "node-postgres (pg)" },
            { label: "Version", value: s?.database?.version ? `PG ${s.database.version}` : "—" },
          ]}
        />
        <ServiceCard
          icon={Wifi}
          label="Redis"
          sub={s?.redis?.version ? `v${s.redis.version} · Embedded in-process` : "Pub/Sub · Rate Limiting · Leader Election"}
          status={s?.redis?.status ?? "unknown"}
          ok={redisOk}
          loading={statusQ.isLoading}
          metrics={[
            { label: "Latency", value: s?.redis?.latencyMs != null ? `${s.redis.latencyMs}ms` : "—" },
            { label: "Clients", value: s?.redis?.connectedClients != null ? String(s.redis.connectedClients) : "—" },
            { label: "Memory", value: s?.redis?.usedMemoryHuman ?? "—" },
          ]}
        />
        <ServiceCard
          icon={Terminal}
          label="Go Matching Engine"
          sub={`Futures order book · Port ${s?.goService?.port ?? "8090"}`}
          status={s?.goService?.status ?? "unknown"}
          ok={goOk}
          loading={statusQ.isLoading}
          metrics={[
            { label: "Latency", value: s?.goService?.latencyMs != null ? `${s.goService.latencyMs}ms` : "—" },
            { label: "Order Books", value: s?.goService?.books != null ? String(s.goService.books) : "—" },
            { label: "Port", value: s?.goService?.port ?? "8090" },
          ]}
        />
        <ServiceCard
          icon={Server}
          label="API Process"
          sub={`Express 5 · Node.js ${s?.process?.nodeVersion ?? ""}`}
          status={s?.process?.status ?? "unknown"}
          ok={procOk}
          loading={statusQ.isLoading}
          metrics={[
            { label: "PID", value: s?.process?.pid != null ? String(s.process.pid) : "—" },
            { label: "Uptime", value: s ? fmtUptime(s.process.uptimeSecs) : "—" },
            { label: "RSS", value: s?.process?.memMb != null ? `${s.process.memMb} MB` : "—" },
          ]}
        />
      </div>

      {/* ─── Memory timeline ───────────────────────────────────────────── */}
      {memHistory.length > 1 && (
        <SectionCard
          title="Memory Usage Timeline"
          icon={Activity}
          description="RSS and Heap memory over time (last 20 samples, ~5 min window)"
        >
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={memHistory} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="rssGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="heapGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}MB`} width={55} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, name: string) => [`${Number(v).toFixed(1)} MB`, name === "mem" ? "RSS" : "Heap"]}
                />
                <Area type="monotone" dataKey="mem" name="RSS" stroke="#3b82f6" strokeWidth={2} fill="url(#rssGrad)" dot={false} />
                <Area type="monotone" dataKey="heap" name="Heap" stroke="#f59e0b" strokeWidth={2} fill="url(#heapGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <LegendDot color="#3b82f6" label="RSS (total process memory)" />
            <LegendDot color="#f59e0b" label="V8 Heap used" />
          </div>
        </SectionCard>
      )}

      {/* ─── Heap donut + Runtime info ─────────────────────────────────── */}
      {s?.process?.heapUsedMb && s?.process?.heapTotalMb && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard title="Heap Utilization" icon={HardDrive} description="V8 heap used vs total allocated">
            <div className="flex items-center gap-6">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%" cy="50%" innerRadius="60%" outerRadius="85%"
                    data={[{ value: heapPct, fill: heapPct > 80 ? "#f43f5e" : heapPct > 60 ? "#f59e0b" : "#10b981" }]}
                    startAngle={90} endAngle={-270}
                  >
                    <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--muted))" }} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize={20} fontWeight={700} fill="hsl(var(--foreground))">
                      {heapPct}%
                    </text>
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 flex-1">
                <MetricRow label="Heap Used" value={`${s.process.heapUsedMb.toFixed(1)} MB`} />
                <MetricRow label="Heap Total" value={`${s.process.heapTotalMb.toFixed(1)} MB`} />
                <MetricRow label="RSS" value={`${s.process.memMb} MB`} />
                <MetricRow label="Status" value={heapPct > 80 ? "High" : heapPct > 60 ? "Moderate" : "Healthy"} valueClass={heapPct > 80 ? "text-rose-400" : heapPct > 60 ? "text-amber-400" : "text-emerald-400"} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Runtime Info" icon={Layers} description="Process and environment details">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Node.js version", value: s.process.nodeVersion, icon: <GitBranch className="w-4 h-4 text-emerald-400" /> },
                { label: "Process ID", value: `PID ${s.process.pid}`, icon: <Cpu className="w-4 h-4 text-blue-400" /> },
                { label: "Uptime", value: fmtUptime(s.process.uptimeSecs), icon: <Clock className="w-4 h-4 text-amber-400" /> },
                { label: "Environment", value: process.env.NODE_ENV ?? "production", icon: <Shield className="w-4 h-4 text-purple-400" /> },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-muted/20">
                  {item.icon}
                  <div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    <div className="text-sm font-semibold">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ─── Diagnostics + Go service detail ───────────────────────────── */}
      {statusQ.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard
            title="Diagnostics Summary"
            icon={allOk ? CheckCircle2 : AlertCircle}
            description={allOk ? "All checks passed" : "Some services need attention"}
          >
            <div className="space-y-2">
              {[
                { label: "PostgreSQL connectivity", ok: dbOk, detail: dbOk ? `PostgreSQL ${s?.database?.version ?? ""} responding normally` : "Database connection failed" },
                { label: "Redis connectivity", ok: redisOk, detail: redisOk ? `Redis v${s?.redis?.version ?? "?"} pub/sub operational` : "Redis connection failed" },
                { label: "Go matching engine", ok: goOk, detail: goOk ? `Engine online · ${s?.goService?.books ?? 0} order books active` : `Engine offline (port ${s?.goService?.port ?? "8090"})` },
                { label: "API process health", ok: procOk, detail: procOk ? `PID ${s?.process?.pid} running · uptime ${fmtUptime(s?.process?.uptimeSecs ?? 0)}` : "Process health check failed" },
                { label: "Heap utilization", ok: heapPct < 80, detail: heapPct < 80 ? `${heapPct}% heap used — within normal range` : `${heapPct}% heap used — consider restarting` },
              ].map(check => (
                <div key={check.label} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50">
                  {check.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{check.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{check.detail}</div>
                  </div>
                  <StatusPill variant={check.ok ? "success" : "danger"} dot={false}>
                    {check.ok ? "Pass" : "Fail"}
                  </StatusPill>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Go Matching Engine"
            icon={Terminal}
            description="Futures order book — high-performance Go service"
          >
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${goOk ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
                <div className={`w-3 h-3 rounded-full ${goOk ? "bg-emerald-400" : "bg-rose-400"} ${goOk ? "animate-pulse" : ""}`} />
                <div>
                  <div className="font-semibold text-sm">{goOk ? "Engine Online" : "Engine Offline"}</div>
                  <div className="text-xs text-muted-foreground">
                    {goOk ? `${s?.goService?.books ?? 0} order books · ${s?.goService?.latencyMs}ms` : `Not reachable on port ${s?.goService?.port ?? "8090"}`}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "Status", value: s?.goService?.status ?? "unknown" },
                  { label: "Latency", value: s?.goService?.latencyMs != null ? `${s.goService.latencyMs}ms` : "—" },
                  { label: "Active Books", value: s?.goService?.books != null ? String(s.goService.books) : "—" },
                  { label: "Port", value: s?.goService?.port ?? "8090" },
                ].map(m => (
                  <div key={m.label} className="flex justify-between p-2.5 rounded-lg border border-border bg-muted/20">
                    <span className="text-muted-foreground text-xs">{m.label}</span>
                    <span className="font-mono text-xs font-semibold">{m.value}</span>
                  </div>
                ))}
              </div>
              {!goOk && (
                <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30 border border-border leading-relaxed">
                  <strong>To start:</strong> Run the Go service workflow or compile with <code className="font-mono bg-muted px-1 rounded">go build</code> inside <code className="font-mono bg-muted px-1 rounded">artifacts/go-service/</code>. The service binds to <code className="font-mono bg-muted px-1 rounded">127.0.0.1:8090</code>.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  icon: Icon, label, sub, status, ok, loading, metrics,
}: {
  icon: typeof Server; label: string; sub: string;
  status: string; ok: boolean; loading: boolean;
  metrics: { label: string; value: string }[];
}) {
  return (
    <div className={`rounded-xl border bg-card/50 p-5 transition-colors ${ok ? "border-emerald-500/30" : "border-rose-500/30"}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ok ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
            <Icon className={`w-5 h-5 ${ok ? "text-emerald-400" : "text-rose-400"}`} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-foreground">{label}</div>
            <div className="text-[10px] text-muted-foreground truncate max-w-[130px]">{sub}</div>
          </div>
        </div>
        {loading ? (
          <div className="w-16 h-6 bg-muted/40 rounded-full animate-pulse" />
        ) : (
          <StatusPill variant={ok ? "success" : "danger"} dot>
            {ok ? "Online" : status === "offline" ? "Offline" : "Error"}
          </StatusPill>
        )}
      </div>
      <div className="space-y-2">
        {metrics.map(m => (
          <div key={m.label} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{m.label}</span>
            <span className="font-mono font-medium">{loading ? "—" : m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
      {label}
    </div>
  );
}
