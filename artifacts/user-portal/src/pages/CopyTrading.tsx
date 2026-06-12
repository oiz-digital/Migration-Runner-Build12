import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import {
  Users, Trophy, TrendingUp, TrendingDown, Star, Plus, X, DollarSign,
  Award, Crown, Medal, Target, Activity, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Trader = {
  id: number; userId: number; displayName: string; bio: string;
  performanceFeeBps: number; tags: string[];
  followersCount: number; aumUsd: string;
  totalTrades: number; winRatePct: string;
  pnl30dPct: string; pnl90dPct: string; pnlAllTimePct: string;
  maxDrawdownPct: string; isActive: boolean;
};
type Relation = {
  id: number; followerId: number; traderId: number;
  allocationUsd: string; copyRatio: string; maxRiskPerTradePct: string;
  status: string; pnlUsd: string; tradesCopied: number;
  startedAt: string; stoppedAt: string | null;
};
type FollowingItem = { relation: Relation; trader: Trader | null };

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
        description="Follow top-performing traders and automatically copy their trades — you control your allocation and risk limits."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
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

function Leaderboard() {
  const [sort, setSort] = useState("pnl30d");
  const { data } = useQuery({
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

      {traders.length === 0 ? (
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

function TraderCard({ trader, rank }: { trader: Trader; rank: number }) {
  const pnl30 = Number(trader.pnl30dPct);
  const win = Number(trader.winRatePct);
  const aum = Number(trader.aumUsd);
  const dd = Number(trader.maxDrawdownPct);

  const RankIcon = rank === 1 ? Crown : rank === 2 ? Award : rank === 3 ? Medal : null;
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
              <div className="font-bold text-base truncate">{trader.displayName}</div>
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
            <Metric label="30d PnL" value={`${pnl30 >= 0 ? "+" : ""}${pnl30.toFixed(2)}%`} good={pnl30 >= 0} />
            <Metric label="Win rate" value={`${win.toFixed(0)}%`} />
            <Metric label="AUM" value={`${aum >= 1000 ? (aum / 1000).toFixed(1) + "k" : aum.toFixed(0)} USDT`} />
            <Metric label="Followers" value={String(trader.followersCount)} />
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-[11px]">
            <span className="text-muted-foreground">Fee: <b className="text-foreground">{(trader.performanceFeeBps / 100).toFixed(1)}%</b> of profits</span>
            {dd > 0 && <span className="text-muted-foreground">Max DD: <b className="text-rose-400">{dd.toFixed(1)}%</b></span>}
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

function FollowDialog({ trader }: { trader: Trader }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alloc, setAlloc] = useState("500");
  const [ratio, setRatio] = useState("1");
  const [maxRisk, setMaxRisk] = useState("5");

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
      toast.success(`Now copying ${trader.displayName}`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not follow"),
  });

  return (
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
            <Label className="text-xs">Allocation (USDT) — what amount to commit</Label>
            <Input type="number" value={alloc} onChange={(e) => setAlloc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Copy ratio</Label>
              <Input type="number" step="0.1" value={ratio} onChange={(e) => setRatio(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">1 = match exact, 0.5 = half size</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max risk / trade (%)</Label>
              <Input type="number" value={maxRisk} onChange={(e) => setMaxRisk(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Cap each copy trade size</p>
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
            Start copying
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Following() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["/copy/me/following"],
    queryFn: () => get<{ items: FollowingItem[] }>("/copy/me/following"),
  });
  const items = data?.items ?? [];
  const active = items.filter((i) => i.relation.status === "active");
  const totalAlloc = active.reduce((s, i) => s + Number(i.relation.allocationUsd), 0);
  const totalPnl = active.reduce((s, i) => s + Number(i.relation.pnlUsd), 0);

  const stopMut = useMutation({
    mutationFn: (id: number) => post(`/copy/relations/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/copy/me/following"] });
      toast.success("Stopped copying");
    },
  });

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <PremiumStatCard title="Active follows" value={String(active.length)} icon={Users} accent />
        <PremiumStatCard title="Total allocated" value={`${totalAlloc.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`} icon={DollarSign} />
        <PremiumStatCard title="Copy PnL" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`} icon={TrendingUp} accent={totalPnl > 0} />
      </div>

      {items.length === 0 ? (
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
                  {Number(it.relation.allocationUsd).toFixed(2)} USDT alloc · {Number(it.relation.copyRatio).toFixed(1)}× ratio · {it.relation.tradesCopied} trades copied
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono font-bold text-sm ${Number(it.relation.pnlUsd) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {Number(it.relation.pnlUsd) >= 0 ? "+" : ""}{Number(it.relation.pnlUsd).toFixed(2)} USDT
                </div>
                {it.relation.status === "active" && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => stopMut.mutate(it.relation.id)}>
                    <X className="h-3 w-3 mr-1" /> Stop
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BecomeTrader() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [fee, setFee] = useState("10");
  const [tags, setTags] = useState("");

  const createMut = useMutation({
    mutationFn: () => post("/copy/become-trader", {
      displayName: name,
      bio,
      performanceFeeBps: Math.round(Number(fee) * 100),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/copy/leaderboard"] });
      toast.success("You're now a trader! Your profile is on the leaderboard.");
    },
    onError: (e: any) => toast.error(e?.message || "Could not register"),
  });

  return (
    <SectionCard
      title="Become a copy trader"
      description="Publish your trader profile and earn a performance fee on every profitable trade others copy from you."
    >
      <div className="space-y-3 max-w-lg">
        <div className="space-y-1.5">
          <Label className="text-xs">Display name</Label>
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
            <p className="text-[10px] text-muted-foreground">% of profits, max 50%</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tags (comma-sep)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="futures, scalping, btc" />
          </div>
        </div>
        <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
          <Crown className="h-3.5 w-3.5 mr-1.5" /> Publish trader profile
        </Button>
      </div>
    </SectionCard>
  );
}
