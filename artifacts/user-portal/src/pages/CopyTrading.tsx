import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import {
  Users, Trophy, TrendingUp, Star, Plus, X, DollarSign,
  Award, Crown, Medal, Target, Activity, Sparkles, ShieldCheck,
  Pencil, Check, Loader2, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Trader = {
  id: number; userId: number; displayName: string; bio: string;
  performanceFeeBps: number; tags: string[];
  followersCount: number; aumUsd: string;
  totalTrades: number; winRatePct: string;
  pnl30dPct: string; pnl90dPct: string;
  pnlAllTimePct: string; maxDrawdownPct: string;
  riskScore: number; isActive: boolean; isVerified: boolean;
};
type Relation = {
  id: number; followerId: number; traderId: number;
  allocationUsd: string; copyRatio: string; maxRiskPerTradePct: string;
  status: string;
  totalPnlUsd: string;    // DB column name
  totalCopiedTrades: number; // DB column name
  startedAt: string; stoppedAt: string | null;
};
type FollowingItem = { relation: Relation; trader: Trader | null };

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function TraderSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-full bg-muted/50 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 bg-muted/50 rounded" />
          <div className="h-3 w-64 bg-muted/40 rounded" />
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-8 bg-muted/40 rounded" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CopyTrading() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"leaderboard" | "following" | "trader">("leaderboard");

  if (user && (user.kycLevel ?? 0) < 1) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        <PageHeader eyebrow="Social" title="Copy Trading" description="Follow top-performing traders automatically." />
        <KycGate requiredLevel={1} feature="Copy Trading" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="Social"
        title="Copy Trading"
        description="Follow top-performing traders and automatically mirror their positions — you control your allocation and risk limits."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full sm:w-auto grid-cols-3">
          <TabsTrigger value="leaderboard"><Trophy className="h-3.5 w-3.5 mr-1.5" /> Leaderboard</TabsTrigger>
          <TabsTrigger value="following"><Star className="h-3.5 w-3.5 mr-1.5" /> Following</TabsTrigger>
          <TabsTrigger value="trader"><Crown className="h-3.5 w-3.5 mr-1.5" /> Become Trader</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="mt-4 space-y-3">
          <Leaderboard />
        </TabsContent>
        <TabsContent value="following" className="mt-4 space-y-3">
          <Following />
        </TabsContent>
        <TabsContent value="trader" className="mt-4 space-y-3">
          <BecomeTrader />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Leaderboard ─────────────────────────────────────────────────────────── */
function Leaderboard() {
  const [sort, setSort] = useState("pnl30d");
  const { data, isLoading } = useQuery({
    queryKey: ["/copy/leaderboard", sort],
    queryFn: () => get<{ items: Trader[] }>(`/copy/leaderboard?sort=${sort}`),
    refetchInterval: 60_000,
  });
  const traders = data?.items ?? [];

  return (
    <>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Sort by</Label>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pnl30d">30d PnL %</SelectItem>
            <SelectItem value="pnl90d">90d PnL %</SelectItem>
            <SelectItem value="winrate">Win rate</SelectItem>
            <SelectItem value="aum">AUM</SelectItem>
            <SelectItem value="followers">Followers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <TraderSkeleton key={i} />)}
        </div>
      ) : traders.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No traders yet"
          description="Be the first to publish your trader profile — claim the top spot."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {traders.map((t, i) => <TraderCard key={t.id} trader={t} rank={i + 1} />)}
        </div>
      )}
    </>
  );
}

/* ─── Trader card ─────────────────────────────────────────────────────────── */
function TraderCard({ trader, rank }: { trader: Trader; rank: number }) {
  const pnl30  = Number(trader.pnl30dPct);
  const pnlAt  = Number(trader.pnlAllTimePct);
  const win    = Number(trader.winRatePct);
  const aum    = Number(trader.aumUsd);
  const dd     = Number(trader.maxDrawdownPct);

  const RankIcon  = rank === 1 ? Crown : rank === 2 ? Award : rank === 3 ? Medal : null;
  const rankColor = rank === 1 ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
    : rank === 2 ? "text-zinc-300 bg-zinc-500/10 border-zinc-500/30"
    : rank === 3 ? "text-orange-400 bg-orange-500/10 border-orange-500/30"
    : "text-muted-foreground bg-muted/40 border-border";

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`h-12 w-12 rounded-full ${rankColor} border flex items-center justify-center flex-shrink-0 font-bold`}>
          {RankIcon ? <RankIcon className="h-5 w-5" /> : `#${rank}`}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm line-clamp-1">{trader.displayName}</span>
                {trader.isVerified && (
                  <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] gap-0.5 px-1.5">
                    <ShieldCheck className="h-2.5 w-2.5" /> Verified
                  </Badge>
                )}
                {!trader.isActive && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                )}
              </div>
              {trader.bio && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{trader.bio}</p>}
            </div>
            <FollowDialog trader={trader} />
          </div>
          {trader.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {trader.tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2 mt-3 text-[11px]">
            <Metric label="30d PnL"   value={`${pnl30 >= 0 ? "+" : ""}${pnl30.toFixed(2)}%`} good={pnl30 >= 0} />
            <Metric label="All-time"  value={`${pnlAt >= 0 ? "+" : ""}${pnlAt.toFixed(1)}%`} good={pnlAt >= 0} />
            <Metric label="Win rate"  value={`${win.toFixed(0)}%`} />
            <Metric label="AUM"       value={`${aum >= 1000 ? (aum / 1000).toFixed(1) + "k" : aum.toFixed(0)} USDT`} />
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-[11px]">
            <span className="text-muted-foreground">
              Fee: <b className="text-foreground">{(trader.performanceFeeBps / 100).toFixed(1)}%</b> of profits
            </span>
            <span className="text-muted-foreground flex items-center gap-2">
              <span><b className="text-foreground">{trader.followersCount}</b> followers</span>
              {dd > 0 && <span className="text-rose-400">DD: {dd.toFixed(1)}%</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`font-mono font-bold ${good === undefined ? "text-foreground" : good ? "text-emerald-400" : "text-rose-400"}`}>
        {value}
      </div>
    </div>
  );
}

/* ─── Follow dialog ───────────────────────────────────────────────────────── */
function FollowDialog({ trader }: { trader: Trader }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alloc, setAlloc] = useState("500");
  const [ratio, setRatio] = useState("1");
  const [maxRisk, setMaxRisk] = useState("5");
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  const followMut = useMutation({
    mutationFn: () => post("/copy/follow", {
      traderId: trader.id,
      allocationUsd: Number(alloc),
      copyRatio: Number(ratio),
      maxRiskPerTradePct: Number(maxRisk),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/copy/leaderboard"] });
      qc.invalidateQueries({ queryKey: ["/copy/me/following"] });
      setOpen(false);
      setGenericSuccess({
        kind: "generic", iconKind: "p2p", accentColor: "#f59e0b",
        title: "Copy Trading Started!",
        subtitle: `You are now copying ${trader.displayName}. Their trades will be mirrored in your account.`,
        rows: [
          { label: "Trader",            value: trader.displayName },
          { label: "Allocation",        value: `${Number(alloc).toLocaleString()} USDT` },
          { label: "Copy Ratio",        value: `${Number(ratio).toFixed(1)}×` },
          { label: "Max Risk / Trade",  value: `${maxRisk}%` },
        ],
        primaryLabel: "View Following",
      });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not follow"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="flex-shrink-0">
            <Plus className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Copy {trader.displayName}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Allocation (USDT) — total capital to commit</Label>
              <Input type="number" value={alloc} onChange={(e) => setAlloc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Copy ratio</Label>
                <Input type="number" step="0.1" value={ratio} onChange={(e) => setRatio(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">1 = match exactly, 0.5 = half size</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max risk / trade (%)</Label>
                <Input type="number" value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Cap per-trade position size</p>
              </div>
            </div>
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Performance fee: <b>{(trader.performanceFeeBps / 100).toFixed(1)}%</b> of profits go to {trader.displayName}.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => followMut.mutate()} disabled={!alloc || followMut.isPending}>
              {followMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Start copying
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}

/* ─── Following tab ───────────────────────────────────────────────────────── */
function Following() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/copy/me/following"],
    queryFn: () => get<{ items: FollowingItem[] }>("/copy/me/following"),
  });
  const items = data?.items ?? [];
  const active     = items.filter((i) => i.relation.status === "active");
  const totalAlloc = active.reduce((s, i) => s + Number(i.relation.allocationUsd), 0);
  const totalPnl   = active.reduce((s, i) => s + Number(i.relation.totalPnlUsd), 0);

  const [stopSuccess, setStopSuccess] = useState<GenericSuccess | null>(null);
  const stopMut = useMutation({
    mutationFn: (id: number) => post(`/copy/relations/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/copy/me/following"] });
      setStopSuccess({
        kind: "generic", iconKind: "p2p", accentColor: "#ef4444",
        title: "Copy Stopped",
        subtitle: "You've stopped copying this trader. Existing positions remain open.",
        rows: [], primaryLabel: "Done",
      });
    },
  });

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <PremiumStatCard title="Active follows"   value={String(active.length)} icon={Users} accent />
        <PremiumStatCard
          title="Total allocated"
          value={`${totalAlloc.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`}
          icon={DollarSign}
        />
        <PremiumStatCard
          title="Copy PnL"
          value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`}
          icon={TrendingUp}
          accent={totalPnl > 0}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="You are not following anyone"
          description="Browse the leaderboard to discover top traders and start copying their strategy."
        />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.relation.id} className="rounded-lg border border-border bg-card/40 p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold flex-shrink-0">
                {it.trader?.displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{it.trader?.displayName ?? "Trader"}</span>
                  <StatusPill variant={it.relation.status === "active" ? "success" : "neutral"}>{it.relation.status}</StatusPill>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {Number(it.relation.allocationUsd).toFixed(2)} USDT alloc ·{" "}
                  {Number(it.relation.copyRatio).toFixed(1)}× ratio ·{" "}
                  {it.relation.totalCopiedTrades} trades copied
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono font-bold text-sm ${Number(it.relation.totalPnlUsd) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {Number(it.relation.totalPnlUsd) >= 0 ? "+" : ""}{Number(it.relation.totalPnlUsd).toFixed(2)} USDT
                </div>
                {it.relation.status === "active" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={stopMut.isPending}
                    onClick={() => stopMut.mutate(it.relation.id)}
                  >
                    <X className="h-3 w-3 mr-1" /> Stop
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <SuccessModal open={stopSuccess !== null} payload={stopSuccess} onClose={() => setStopSuccess(null)} />
    </>
  );
}

/* ─── Become trader tab ───────────────────────────────────────────────────── */
function BecomeTrader() {
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["/copy/me/profile"],
    queryFn: () => get<{ trader: Trader | null }>("/copy/me/profile"),
  });

  const existing = profileQ.data?.trader ?? null;

  if (profileQ.isLoading) {
    return <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />;
  }

  return existing ? (
    <TraderProfileEditor trader={existing} onUpdated={() => qc.invalidateQueries({ queryKey: ["/copy/me/profile"] })} />
  ) : (
    <RegisterTrader onCreated={() => qc.invalidateQueries({ queryKey: ["/copy/me/profile"] })} />
  );
}

/* ─── Trader profile editor (already registered) ─────────────────────────── */
function TraderProfileEditor({ trader, onUpdated }: { trader: Trader; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(trader.displayName);
  const [bio, setBio]         = useState(trader.bio ?? "");
  const [fee, setFee]         = useState(String(trader.performanceFeeBps / 100));
  const [tags, setTags]       = useState((trader.tags ?? []).join(", "));
  const [active, setActive]   = useState(trader.isActive);

  const updateMut = useMutation({
    mutationFn: () => patch("/copy/me", {
      displayName: name,
      bio,
      performanceFeeBps: Math.round(Number(fee) * 100),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      isActive: active,
    }),
    onSuccess: () => { setEditing(false); onUpdated(); toast.success("Trader profile updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <SectionCard
      title="Your Trader Profile"
      description="You are registered as a copy trader. Followers can copy your trades."
    >
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatBox label="Followers" value={String(trader.followersCount)} icon={Users} />
        <StatBox label="AUM (USDT)" value={Number(trader.aumUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })} icon={DollarSign} />
        <StatBox label="30d PnL" value={`${Number(trader.pnl30dPct) >= 0 ? "+" : ""}${Number(trader.pnl30dPct).toFixed(2)}%`} icon={TrendingUp} green={Number(trader.pnl30dPct) >= 0} />
        <StatBox label="Win Rate" value={`${Number(trader.winRatePct).toFixed(0)}%`} icon={Target} />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          {trader.isVerified && (
            <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1">
              <ShieldCheck className="h-3 w-3" /> Verified
            </Badge>
          )}
          <Badge variant={trader.isActive ? "default" : "outline"} className={trader.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : ""}>
            {trader.isActive ? "Active" : "Paused"}
          </Badge>
        </div>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setEditing(!editing)}>
          <Pencil className="h-3.5 w-3.5" /> {editing ? "Cancel edit" : "Edit profile"}
        </Button>
      </div>

      {!editing ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5 text-sm">
          <div><span className="text-muted-foreground text-xs uppercase">Display name</span><div className="font-semibold">{trader.displayName}</div></div>
          <div><span className="text-muted-foreground text-xs uppercase">Bio</span><div className="text-muted-foreground">{trader.bio || "—"}</div></div>
          <div><span className="text-muted-foreground text-xs uppercase">Performance fee</span><div>{(trader.performanceFeeBps / 100).toFixed(1)}% of profits</div></div>
          <div><span className="text-muted-foreground text-xs uppercase">Tags</span><div>{(trader.tags ?? []).join(", ") || "—"}</div></div>
        </div>
      ) : (
        <div className="space-y-3 max-w-lg">
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Performance fee (%)</Label>
              <Input type="number" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="btc, scalping, futures" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active-toggle"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="active-toggle" className="text-xs cursor-pointer">
              Profile active (visible to followers)
            </Label>
          </div>
          <Button onClick={() => updateMut.mutate()} disabled={!name || updateMut.isPending}>
            {updateMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Save changes
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function StatBox({ label, value, icon: Icon, green }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; green?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`font-bold text-sm font-mono ${green === true ? "text-emerald-400" : green === false ? "text-rose-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/* ─── Register new trader ─────────────────────────────────────────────────── */
function RegisterTrader({ onCreated }: { onCreated: () => void }) {
  const [name, setName]   = useState("");
  const [bio, setBio]     = useState("");
  const [fee, setFee]     = useState("10");
  const [tags, setTags]   = useState("");
  const [success, setSuccess] = useState<GenericSuccess | null>(null);

  const createMut = useMutation({
    mutationFn: () => post("/copy/become-trader", {
      displayName: name,
      bio,
      performanceFeeBps: Math.round(Number(fee) * 100),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      setSuccess({
        kind: "generic", iconKind: "p2p", accentColor: "#f59e0b",
        title: "Trader Profile Live!",
        subtitle: "You're now listed on the leaderboard. Followers can start copying your trades.",
        rows: [
          { label: "Display Name",     value: name },
          { label: "Performance Fee",  value: `${Number(fee).toFixed(1)}%` },
        ],
        primaryLabel: "View Leaderboard",
        onPrimaryExtra: onCreated,
      });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not register"),
  });

  return (
    <>
      <SectionCard
        title="Become a copy trader"
        description="Publish your profile and earn a performance fee on every profitable trade others copy from you."
      >
        <div className="space-y-3 max-w-lg">
          <div className="space-y-1.5">
            <Label className="text-xs">Display name <span className="text-rose-400">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CryptoWizard" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Pro futures trader · 5 years exp · BTC/ETH focus" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Performance fee (%)</Label>
              <Input type="number" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">0–50% of profits, max 50%</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="futures, scalping, btc" />
            </div>
          </div>
          <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] text-sky-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold"><BarChart2 className="h-3 w-3" /> Requirements</div>
            <ul className="list-disc list-inside space-y-0.5 text-sky-200/70">
              <li>KYC Level 1 verification required</li>
              <li>Performance stats update every 24 hours</li>
              <li>You can pause or stop at any time</li>
            </ul>
          </div>
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            {createMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-3.5 w-3.5 mr-1.5" />}
            Publish trader profile
          </Button>
        </div>
      </SectionCard>
      <SuccessModal open={success !== null} payload={success} onClose={() => setSuccess(null)} />
    </>
  );
}
