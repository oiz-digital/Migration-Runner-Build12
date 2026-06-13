import { useState, useMemo, useRef, useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield, BadgeCheck, Lock, Clock, CheckCircle2, XCircle, AlertCircle,
  Loader2, Upload, FileText, User as UserIcon, Camera, MapPin, Calendar,
  Hash, ArrowRight, Info, IdCard, Mail, Phone, Crown, Gift, KeyRound,
  Copy, Check, Fingerprint, ShieldCheck, ShieldOff, TrendingUp, Eye, X,
} from "lucide-react";
import { get, post, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Link } from "wouter";

type KycSetting = {
  level: number;
  depositLimit: string | number;
  withdrawLimit: string | number;
  tradeLimit: string | number;
  features: string[] | string;
};

function parseFeatures(f: string[] | string | null | undefined): string[] {
  if (!f) return [];
  if (Array.isArray(f)) return f;
  try {
    const parsed = JSON.parse(f);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type KycRecord = {
  id: number;
  level: number;
  status: "pending" | "approved" | "rejected";
  fullName: string | null;
  dob: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  address: string | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const LEVEL_META: Record<number, { name: string; tagline: string; color: string; icon: any }> = {
  1: { name: "Basic", tagline: "PAN + Personal Info", color: "sky", icon: IdCard },
  2: { name: "Intermediate", tagline: "Aadhaar + Documents", color: "amber", icon: FileText },
  3: { name: "Advanced", tagline: "Selfie + Address", color: "emerald", icon: Camera },
};

const FEATURE_LABELS: Record<string, string> = {
  browse: "Browse markets",
  deposit: "Deposit funds",
  trade: "Spot trading",
  withdraw: "Withdrawals",
  earn_simple: "Flexible Earn",
  earn_advanced: "Locked Earn",
  futures: "Futures trading",
  margin: "Margin trading",
};

function fmtINR(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function maskPhone(p: string | null | undefined): string {
  if (!p) return "—";
  if (p.length < 6) return p;
  return p.slice(0, 3) + "•••••" + p.slice(-2);
}

function maskEmail(e: string | null | undefined): string {
  if (!e) return "—";
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  if (u.length <= 2) return e;
  return u.slice(0, 2) + "•••" + "@" + d;
}

export default function Kyc() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const settingsQ = useQuery<KycSetting[]>({
    queryKey: ["/kyc/settings"],
    queryFn: () => get<KycSetting[]>("/kyc/settings"),
  });

  const myKycQ = useQuery<KycRecord[]>({
    queryKey: ["/kyc/my"],
    queryFn: () => get<KycRecord[]>("/kyc/my"),
  });

  const [submitFor, setSubmitFor] = useState<number | null>(null);

  const currentLevel = user?.kycLevel ?? 0;

  const latestByLevel = useMemo(() => {
    const map = new Map<number, KycRecord>();
    const records = myKycQ.data ?? [];
    for (const r of records) {
      if (!map.has(r.level)) map.set(r.level, r);
    }
    return map;
  }, [myKycQ.data]);

  const settings = settingsQ.data ?? [];
  const sorted = [...settings].sort((a, b) => a.level - b.level);

  const currentSettings = useMemo(
    () => sorted.find((s) => s.level === currentLevel),
    [sorted, currentLevel],
  );

  const verification = useMemo(() => {
    const emailOk = !!user?.emailVerified;
    const phoneOk = !!user?.phoneVerified;
    const twoFaOk = !!user?.twoFaEnabled;
    const kycFull = currentLevel >= 3;
    if (kycFull && emailOk && phoneOk && twoFaOk) return { label: "Fully Verified", variant: "success" as const };
    if (currentLevel >= 1 && emailOk) return { label: "Verified", variant: "success" as const };
    if (currentLevel >= 1) return { label: "Partial", variant: "warning" as const };
    return { label: "Unverified", variant: "danger" as const };
  }, [currentLevel, user?.emailVerified, user?.phoneVerified, user?.twoFaEnabled]);

  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Compliance"
        title="KYC Verification"
        description="Verify your identity to unlock higher limits and additional features."
        actions={
          <StatusPill variant={currentLevel >= 3 ? "gold" : currentLevel >= 1 ? "success" : "warning"}>
            <BadgeCheck className="h-3 w-3 mr-0.5" /> Level {currentLevel} / 3
          </StatusPill>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="kyc-kpis">
        <PremiumStatCard
          title="Verification"
          value={verification.label}
          icon={verification.variant === "success" ? ShieldCheck : ShieldOff}
          accent={verification.variant === "success"}
          hint={`${currentLevel}/3 levels`}
        />
        <PremiumStatCard
          title="Daily Withdraw"
          value={currentSettings ? fmtINR(Number(currentSettings.withdrawLimit)) : "—"}
          icon={TrendingUp}
          hint={currentLevel === 0 ? "Submit L1 to unlock" : `Level ${currentLevel} limit`}
        />
        <PremiumStatCard
          title="Daily Trade"
          value={currentSettings ? fmtINR(Number(currentSettings.tradeLimit)) : "—"}
          icon={TrendingUp}
          hint={currentLevel === 0 ? "Submit L1 to unlock" : `Level ${currentLevel} limit`}
        />
        <PremiumStatCard
          title="VIP Tier"
          value={user?.vipTier ? `VIP ${user.vipTier}` : "Standard"}
          icon={Crown}
          accent={!!user?.vipTier}
          hint={user?.vipTier ? "Premium fee tier" : "Trade more to upgrade"}
        />
      </div>

      <SectionCard
        title="Account Details"
        description="Your current account information and verification status."
        icon={UserIcon}
      >
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex items-center gap-4 sm:w-72 shrink-0">
            <KycAvatar user={user} />
            <div className="min-w-0">
              <div className="font-semibold text-sm line-clamp-1" data-testid="account-name">
                {user?.name || user?.fullName || "—"}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                UID: <span className="font-mono">{user?.uid ?? user?.id ?? "—"}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <StatusPill status={user?.status || "active"} />
                {user?.role && user.role !== "user" && (
                  <StatusPill variant="gold">{user.role.toUpperCase()}</StatusPill>
                )}
              </div>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-auto" />
          <Separator className="sm:hidden" />

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <DetailField
              icon={Mail} label="Email" value={maskEmail(user?.email)} testId="account-email"
              trailing={
                user?.emailVerified
                  ? <StatusPill variant="success">Verified</StatusPill>
                  : <StatusPill variant="warning">Unverified</StatusPill>
              }
            />
            <DetailField
              icon={Phone} label="Phone" value={user?.phone ? maskPhone(user.phone) : "Not added"} testId="account-phone"
              trailing={
                user?.phoneVerified
                  ? <StatusPill variant="success">Verified</StatusPill>
                  : user?.phone ? <StatusPill variant="warning">Unverified</StatusPill> : null
              }
            />
            <DetailField
              icon={KeyRound} label="Two-Factor Auth" value={user?.twoFaEnabled ? "Enabled" : "Disabled"} testId="account-2fa"
              trailing={
                user?.twoFaEnabled
                  ? <StatusPill variant="success">Active</StatusPill>
                  : (
                    <Link href="/settings">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-amber-400 hover:text-amber-300">Enable</Button>
                    </Link>
                  )
              }
            />
            <DetailField
              icon={Fingerprint}
              label="KYC Level"
              value={`Level ${currentLevel}${currentLevel ? ` · ${LEVEL_META[currentLevel]?.name ?? ""}` : " · Unverified"}`}
              testId="account-kyc"
              trailing={
                currentLevel >= 3
                  ? <StatusPill variant="gold">Full</StatusPill>
                  : currentLevel >= 1
                    ? <StatusPill variant="success">L{currentLevel}</StatusPill>
                    : <StatusPill variant="warning">L0</StatusPill>
              }
            />
            <DetailField icon={Calendar} label="Member Since" value={fmtDate(user?.createdAt)} testId="account-created" />
            <DetailField icon={Clock} label="Last Login" value={fmtDateTime(user?.lastLoginAt)} testId="account-last-login" />
            <DetailField
              icon={Gift} label="Referral Code" value={user?.referralCode || "—"} mono testId="account-ref"
              trailing={user?.referralCode ? <CopyButton value={user.referralCode} /> : null}
            />
            <DetailField
              icon={Crown} label="VIP Tier" value={user?.vipTier ? `VIP ${user.vipTier}` : "Standard"} testId="account-vip"
            />
          </div>
        </div>
      </SectionCard>

      {/* Progress bar */}
      <Card className="p-5" data-testid="kyc-progress">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Verification progress</span>
          <span className="text-xs text-muted-foreground tabular-nums">{currentLevel} / 3 levels</span>
        </div>
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-amber-500 to-orange-500 rounded-full transition-all duration-700"
            style={{ width: `${(currentLevel / 3) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-4 mt-2 text-[10px] text-muted-foreground uppercase tracking-wider">
          <span>L0 · Unverified</span>
          <span className="text-center">L1 · Basic</span>
          <span className="text-center">L2 · Intermediate</span>
          <span className="text-right">L3 · Advanced</span>
        </div>
      </Card>

      {/* Levels grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sorted.filter((s) => s.level >= 1).map((s) => {
          const meta = LEVEL_META[s.level];
          const latest = latestByLevel.get(s.level);
          const achieved = currentLevel >= s.level;
          const isPrevReq = s.level > 1 && currentLevel < s.level - 1;
          const Icon = meta.icon;

          let status: "achieved" | "pending" | "rejected" | "available" | "locked" = "available";
          if (achieved) status = "achieved";
          else if (latest?.status === "pending") status = "pending";
          else if (latest?.status === "rejected") status = "rejected";
          else if (isPrevReq) status = "locked";

          const tones: Record<string, string> = {
            sky: "from-sky-500/10 border-sky-500/30 text-sky-400",
            amber: "from-amber-500/10 border-amber-500/30 text-amber-400",
            emerald: "from-emerald-500/10 border-emerald-500/30 text-emerald-400",
          };

          return (
            <Card key={s.level} className={`p-5 border bg-gradient-to-br ${tones[meta.color]} to-card flex flex-col`} data-testid={`level-card-${s.level}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-card/60 flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
                <LevelStatusBadge status={status} />
              </div>

              <h3 className="font-bold text-lg">Level {s.level} · {meta.name}</h3>
              <p className="text-xs text-muted-foreground mb-3">{meta.tagline}</p>

              <Separator className="my-2" />

              <div className="grid grid-cols-2 gap-2 text-xs my-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily withdraw</div>
                  <div className="font-bold tabular-nums">{fmtINR(Number(s.withdrawLimit))}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily trade</div>
                  <div className="font-bold tabular-nums">{fmtINR(Number(s.tradeLimit))}</div>
                </div>
              </div>

              <div className="my-2 flex flex-wrap gap-1">
                {parseFeatures(s.features).map((f) => (
                  <Badge key={f} variant="outline" className="text-[9px] font-normal">
                    {FEATURE_LABELS[f] ?? f}
                  </Badge>
                ))}
              </div>

              {latest?.status === "rejected" && latest.rejectReason && (
                <div className="mt-2 text-xs text-rose-400 rounded-md bg-rose-500/10 border border-rose-500/30 p-2 flex items-start gap-1.5">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span><span className="font-semibold">Rejected:</span> {latest.rejectReason}</span>
                </div>
              )}

              <div className="mt-auto pt-3">
                {status === "achieved" && (
                  <Button variant="outline" disabled className="w-full">
                    <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approved
                  </Button>
                )}
                {status === "pending" && (
                  <Button variant="outline" disabled className="w-full">
                    <Clock className="h-4 w-4 mr-1.5" /> Under Review
                  </Button>
                )}
                {status === "locked" && (
                  <Button variant="outline" disabled className="w-full">
                    <Lock className="h-4 w-4 mr-1.5" /> Complete L{s.level - 1} first
                  </Button>
                )}
                {(status === "available" || status === "rejected") && (
                  <Button
                    onClick={() => setSubmitFor(s.level)}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
                    data-testid={`button-submit-l${s.level}`}
                  >
                    {status === "rejected" ? "Re-submit" : "Submit"} <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Submission history */}
      {(myKycQ.data?.length ?? 0) > 0 && (
        <SectionCard title="Submission history" icon={FileText}>
          <div className="space-y-2">
            {(myKycQ.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 text-sm" data-testid={`record-${r.id}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="text-[10px]">L{r.level}</Badge>
                  <div className="min-w-0">
                    <div className="font-medium line-clamp-1">{r.fullName || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Submitted {new Date(r.createdAt).toLocaleString()}
                      {r.reviewedAt && ` · Reviewed ${new Date(r.reviewedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <Card className="p-4 border-border/60 bg-muted/20">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1">How it works</p>
            <ul className="space-y-0.5 list-disc list-inside marker:text-muted-foreground/40">
              <li>Submissions are typically reviewed within <span className="text-foreground">24 hours</span>.</li>
              <li>Upload clear, well-lit photos of original documents — do not use screenshots.</li>
              <li>Details must match your bank account name for withdrawals to process.</li>
              <li>If rejected, we will provide a reason and you can resubmit at any time.</li>
            </ul>
          </div>
        </div>
      </Card>

      <KycSubmitDialog
        level={submitFor}
        prevRecords={latestByLevel}
        onOpenChange={(v) => { if (!v) setSubmitFor(null); }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["/kyc/my"] });
          setSubmitFor(null);
        }}
      />
    </div>
  );
}

// ───────────────── Account-detail field row ─────────────────
function DetailField({
  icon: Icon, label, value, trailing, mono, testId,
}: {
  icon: any; label: string; value: string; trailing?: React.ReactNode; mono?: boolean; testId?: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0" data-testid={testId}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm line-clamp-1 ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  );
}

// ───────────────── Avatar (initials fallback) ─────────────────
function KycAvatar({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name || user.email}
        className="h-14 w-14 rounded-full object-cover border border-border/60"
      />
    );
  }
  const seed = (user?.name || user?.fullName || user?.email || "?").trim();
  const initials = seed
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  return (
    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-lg">
      {initials}
    </div>
  );
}

// ───────────────── Copy-to-clipboard button ─────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onCopy} className="h-6 px-2 text-[11px]" data-testid="copy-referral">
      {copied ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// ───────────────── Level status badge ─────────────────
function LevelStatusBadge({ status }: { status: "achieved" | "pending" | "rejected" | "available" | "locked" }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    achieved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
    pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Clock },
    rejected: { label: "Rejected", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", Icon: XCircle },
    available: { label: "Available", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", Icon: ArrowRight },
    locked: { label: "Locked", cls: "bg-zinc-500/15 text-muted-foreground border-zinc-500/30", Icon: Lock },
  };
  const m = map[status];
  const Icon = m.Icon;
  return (
    <Badge className={`${m.cls} border text-[10px] font-bold uppercase`}>
      <Icon className="h-2.5 w-2.5 mr-0.5" /> {m.label}
    </Badge>
  );
}

// ───────────────── Image preview modal ─────────────────
function ImagePreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-card border border-border rounded-full p-1 text-muted-foreground hover:text-foreground z-10"
        >
          <X className="h-4 w-4" />
        </button>
        <img src={url} alt="Document preview" className="w-full rounded-xl object-contain max-h-[80vh]" />
      </div>
    </div>
  );
}

// ───────────────── File upload field (base64 client-side) ─────────────────
function FileUploadField({
  label, testId, url, setUrl, hint,
}: { label: string; testId: string; url: string; setUrl: (u: string) => void; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  const onFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File too large — maximum 8 MB allowed");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file type — please upload an image (JPG, PNG, WEBP)");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      setUrl(dataUrl);
      toast.success(`${label} uploaded — image ready for submission.`);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  };

  const clearUrl = () => {
    setUrl("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <Label className="flex items-center gap-1.5">
        <Upload className="h-3 w-3" /> {label}
        {hint && <span className="text-muted-foreground font-normal text-[10px]">— {hint}</span>}
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        data-testid={`${testId}-input`}
      />

      {url ? (
        <div className="mt-1.5 space-y-2">
          <div className="relative rounded-lg overflow-hidden border border-emerald-500/40 bg-muted/20 aspect-[4/2.2] max-h-32">
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="bg-black/70 text-white rounded-full p-1.5 hover:bg-black"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="bg-black/70 text-white rounded-full p-1.5 hover:bg-black"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={clearUrl}
                className="bg-black/70 text-white rounded-full p-1.5 hover:bg-black"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1" data-testid={`${testId}-status`}>
            <CheckCircle2 className="h-3 w-3" /> Uploaded — hover image to replace or remove
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          data-testid={`${testId}-button`}
          className="mt-1.5 w-full border-2 border-dashed border-border/60 hover:border-amber-500/50 rounded-lg p-4 flex flex-col items-center justify-center gap-2 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading
            ? <><Loader2 className="h-5 w-5 animate-spin text-amber-400" /><span className="text-xs">Processing…</span></>
            : <><Upload className="h-5 w-5" /><span className="text-xs">Click to upload image</span><span className="text-[10px] text-muted-foreground/60">JPG, PNG, WEBP — max 8 MB</span></>
          }
        </button>
      )}

      {preview && url && <ImagePreviewModal url={url} onClose={() => setPreview(false)} />}
    </div>
  );
}

// ───────────────── Submit dialog ─────────────────
function KycSubmitDialog({
  level, prevRecords, onOpenChange, onSuccess,
}: {
  level: number | null;
  prevRecords: Map<number, KycRecord>;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const lvl = level ?? 0;
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  // Pre-populate from previous approved level
  const prevApproved = useMemo(() => {
    for (let l = lvl - 1; l >= 1; l--) {
      const r = prevRecords.get(l);
      if (r?.status === "approved") return r;
    }
    return null;
  }, [prevRecords, lvl]);

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [pan, setPan] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [address, setAddress] = useState("");
  const [panDocUrl, setPanDocUrl] = useState("");
  const [aadhaarDocUrl, setAadhaarDocUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  useEffect(() => {
    if (level !== null && prevApproved) {
      if (prevApproved.fullName) setFullName(prevApproved.fullName);
      if (prevApproved.dob) setDob(prevApproved.dob);
      if (prevApproved.panNumber) setPan(prevApproved.panNumber);
      if (prevApproved.aadhaarNumber) setAadhaar(prevApproved.aadhaarNumber);
      if (prevApproved.address) setAddress(prevApproved.address);
    }
  }, [level, prevApproved]);

  const reset = () => {
    setFullName(""); setDob(""); setPan(""); setAadhaar(""); setAddress("");
    setPanDocUrl(""); setAadhaarDocUrl(""); setSelfieUrl("");
    setSubmitting(false); setTouched({});
  };

  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const panOk = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
  const aadhaarOk = /^\d{12}$/.test(aadhaar.replace(/\s+/g, ""));

  const errors: Record<string, string> = {};
  if (!fullName.trim()) errors.fullName = "Full name is required";
  if (!dob) errors.dob = "Date of birth is required";
  if (!panOk) errors.pan = "Enter valid PAN — format: AAAAA1111A";
  if (lvl >= 2 && !aadhaarOk) errors.aadhaar = "Enter valid 12-digit Aadhaar number";
  if (lvl >= 2 && !panDocUrl) errors.panDoc = "Upload your PAN card image";
  if (lvl >= 2 && !aadhaarDocUrl) errors.aadhaarDoc = "Upload your Aadhaar card image";
  if (lvl >= 3 && !selfieUrl) errors.selfie = "Upload a selfie holding your PAN card";
  if (lvl >= 3 && !address.trim()) errors.address = "Full address is required";

  const firstError = Object.values(errors)[0] ?? null;
  const canSubmit = !firstError && !submitting;

  const submit = async () => {
    setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
    if (firstError || !level) return;
    setSubmitting(true);
    try {
      await post("/kyc/submit", {
        level,
        fullName: fullName.trim(),
        dob,
        panNumber: pan.toUpperCase(),
        aadhaarNumber: lvl >= 2 ? aadhaar.replace(/\s+/g, "") : undefined,
        panDocUrl: lvl >= 2 ? panDocUrl : undefined,
        aadhaarDocUrl: lvl >= 2 ? aadhaarDocUrl : undefined,
        selfieUrl: lvl >= 3 ? selfieUrl : undefined,
        address: lvl >= 3 ? address.trim() : undefined,
      });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "emerald", title: "Submission Received!", subtitle: "We'll review your documents within 24 hours. You'll be notified of the outcome.", rows: [{ label: "KYC Level", value: `Level ${level}` }, { label: "Status", value: "Under Review" }, { label: "ETA", value: "Within 24 hours" }], primaryLabel: "Track Status" });
      reset();
      onSuccess();
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message;
      toast.error(msg || "Submission failed — please try again");
      setSubmitting(false);
    }
  };

  const fieldError = (key: string) => touched[key] && errors[key] ? (
    <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
      <AlertCircle className="h-3 w-3 flex-shrink-0" /> {errors[key]}
    </p>
  ) : null;

  const levelColors = { 1: "sky", 2: "amber", 3: "emerald" } as Record<number, string>;
  const levelColor = levelColors[lvl] ?? "amber";

  return (
    <>
    <Dialog open={level !== null} onOpenChange={(v) => { if (!v) { reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className={`h-7 w-7 rounded-md bg-${levelColor}-500/20 flex items-center justify-center`}>
              <Shield className={`h-4 w-4 text-${levelColor}-400`} />
            </div>
            Level {level} Verification — {LEVEL_META[lvl]?.name}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {lvl === 1 && "Provide your name, date of birth, and PAN number exactly as on your PAN card."}
            {lvl === 2 && "Add your Aadhaar number and upload clear photos of your PAN and Aadhaar cards."}
            {lvl === 3 && "Final step — upload a selfie holding your PAN card, and enter your full residential address."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Section: Personal Info (all levels) ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
              <UserIcon className="h-3.5 w-3.5" /> Personal Information
            </div>

            <div>
              <Label htmlFor={fieldId("fn")} className="text-xs">
                Full Name <span className="text-rose-400">*</span>
                <span className="text-muted-foreground font-normal ml-1">(as on PAN card)</span>
              </Label>
              <Input
                id={fieldId("fn")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => touch("fullName")}
                placeholder="e.g. RAHUL KUMAR SHARMA"
                className={touched.fullName && errors.fullName ? "border-rose-500/60" : ""}
                data-testid="input-kyc-name"
                readOnly={!!prevApproved?.fullName && lvl > 1}
              />
              {fieldError("fullName")}
              {prevApproved?.fullName && lvl > 1 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Pre-filled from your Level {prevApproved.level} approval</p>
              )}
            </div>

            <div>
              <Label htmlFor={fieldId("dob")} className="text-xs">
                Date of Birth <span className="text-rose-400">*</span>
              </Label>
              <Input
                id={fieldId("dob")}
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                onBlur={() => touch("dob")}
                max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                className={touched.dob && errors.dob ? "border-rose-500/60" : ""}
                data-testid="input-kyc-dob"
                readOnly={!!prevApproved?.dob && lvl > 1}
              />
              {fieldError("dob")}
            </div>

            <div>
              <Label htmlFor={fieldId("pan")} className="text-xs">
                PAN Number <span className="text-rose-400">*</span>
              </Label>
              <Input
                id={fieldId("pan")}
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                onBlur={() => touch("pan")}
                placeholder="AAAAA1111A"
                maxLength={10}
                className={`font-mono uppercase tracking-widest ${touched.pan && errors.pan ? "border-rose-500/60" : panOk ? "border-emerald-500/50" : ""}`}
                data-testid="input-kyc-pan"
                readOnly={!!prevApproved?.panNumber && lvl > 1}
              />
              {fieldError("pan")}
              {panOk && !errors.pan && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3 w-3" /> Valid PAN format
                </p>
              )}
            </div>
          </div>

          {/* ── Section: Aadhaar + Docs (L2+) ── */}
          {lvl >= 2 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
                  <IdCard className="h-3.5 w-3.5" /> Aadhaar Verification
                </div>

                <div>
                  <Label htmlFor={fieldId("aad")} className="text-xs">
                    Aadhaar Number <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    id={fieldId("aad")}
                    value={aadhaar}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                      const spaced = digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
                      setAadhaar(digits);
                      e.target.value = spaced;
                    }}
                    onBlur={() => touch("aadhaar")}
                    placeholder="1234 5678 9012"
                    className={`font-mono ${touched.aadhaar && errors.aadhaar ? "border-rose-500/60" : aadhaarOk ? "border-emerald-500/50" : ""}`}
                    data-testid="input-kyc-aadhaar"
                  />
                  {fieldError("aadhaar")}
                  {aadhaarOk && !errors.aadhaar && (
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3 w-3" /> Valid Aadhaar format
                    </p>
                  )}
                </div>

                <FileUploadField
                  label="PAN Card Image"
                  testId="upload-pan"
                  url={panDocUrl}
                  setUrl={(u) => { setPanDocUrl(u); touch("panDoc"); }}
                  hint="front side clearly visible"
                />
                {fieldError("panDoc")}

                <FileUploadField
                  label="Aadhaar Card Image"
                  testId="upload-aadhaar"
                  url={aadhaarDocUrl}
                  setUrl={(u) => { setAadhaarDocUrl(u); touch("aadhaarDoc"); }}
                  hint="both front and back if possible"
                />
                {fieldError("aadhaarDoc")}
              </div>
            </>
          )}

          {/* ── Section: Selfie + Address (L3) ── */}
          {lvl >= 3 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
                  <Camera className="h-3.5 w-3.5" /> Selfie & Address
                </div>

                <FileUploadField
                  label="Selfie holding PAN card"
                  testId="upload-selfie"
                  url={selfieUrl}
                  setUrl={(u) => { setSelfieUrl(u); touch("selfie"); }}
                  hint="face + PAN visible in same frame"
                />
                {fieldError("selfie")}

                <div>
                  <Label htmlFor={fieldId("addr")} className="text-xs">
                    Residential Address <span className="text-rose-400">*</span>
                  </Label>
                  <Textarea
                    id={fieldId("addr")}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onBlur={() => touch("address")}
                    placeholder="Door no., Street, Area, City, State — PIN code"
                    rows={3}
                    className={touched.address && errors.address ? "border-rose-500/60" : ""}
                    data-testid="input-kyc-address"
                  />
                  {fieldError("address")}
                </div>
              </div>
            </>
          )}

          {/* Global error summary */}
          {Object.keys(touched).length > 0 && firstError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300">{firstError}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold min-w-[140px]"
            data-testid="button-submit-kyc"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…</>
              : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Submit for review</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}
