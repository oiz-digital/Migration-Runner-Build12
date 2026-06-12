import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, post } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings, Save, ChevronDown, ChevronRight, Eye, EyeOff,
  Globe, Zap, Banknote, CreditCard, Share2, BarChart3, RefreshCw,
  ShieldCheck, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS: {
  label: string;
  icon: typeof Settings;
  description: string;
  keys: { key: string; label: string; type?: "boolean" | "number" | "secret" | "textarea"; hint?: string }[];
}[] = [
  {
    label: "Identity",
    icon: Globe,
    description: "Exchange name, tagline, and contact info",
    keys: [
      { key: "exchange_name",     label: "Exchange Name" },
      { key: "exchange_short",    label: "Short Name" },
      { key: "exchange_tagline",  label: "Tagline" },
      { key: "support_email",     label: "Support Email" },
      { key: "support_phone",     label: "Support Phone" },
      { key: "announcement_text", label: "Announcement Banner", type: "textarea" },
    ],
  },
  {
    label: "Features",
    icon: Zap,
    description: "Enable or disable platform features",
    keys: [
      { key: "maintenance_mode",        label: "Maintenance Mode",       type: "boolean", hint: "Disables all trading — shows maintenance page to users" },
      { key: "registration_enabled",    label: "Registration Enabled",   type: "boolean" },
      { key: "spot_enabled",            label: "Spot Trading",           type: "boolean" },
      { key: "futures_enabled",         label: "Futures Trading",        type: "boolean" },
      { key: "earn_enabled",            label: "Earn Products",          type: "boolean" },
      { key: "ai_trading_enabled",      label: "AI Trading",             type: "boolean" },
      { key: "inr_deposits_enabled",    label: "INR Deposits",           type: "boolean" },
      { key: "inr_withdrawals_enabled", label: "INR Withdrawals",        type: "boolean" },
      { key: "referral_enabled",        label: "Referral System",        type: "boolean" },
    ],
  },
  {
    label: "INR & Fees",
    icon: Banknote,
    description: "INR rate, deposit/withdrawal limits and tax settings",
    keys: [
      { key: "inr_rate",            label: "INR/USD Rate",      type: "number", hint: "e.g. 83.5 — used for display conversions" },
      { key: "min_inr_deposit",     label: "Min INR Deposit",   type: "number" },
      { key: "max_inr_deposit",     label: "Max INR Deposit",   type: "number" },
      { key: "min_inr_withdrawal",  label: "Min INR Withdrawal",type: "number" },
      { key: "max_inr_withdrawal",  label: "Max INR Withdrawal",type: "number" },
      { key: "tds_enabled",         label: "TDS Enabled",       type: "boolean", hint: "India 1% TDS on crypto transactions" },
      { key: "tds_rate",            label: "TDS Rate %",        type: "number",  hint: "e.g. 1 for 1%" },
    ],
  },
  {
    label: "Payment Details",
    icon: CreditCard,
    description: "UPI ID and bank account for INR deposits",
    keys: [
      { key: "upi_id",               label: "UPI ID" },
      { key: "bank_name",            label: "Bank Name" },
      { key: "bank_account_number",  label: "Account Number" },
      { key: "bank_ifsc",            label: "IFSC Code" },
      { key: "bank_account_holder",  label: "Account Holder Name" },
    ],
  },
  {
    label: "Razorpay",
    icon: ShieldCheck,
    description: "Payment gateway credentials",
    keys: [
      { key: "razorpay_key_id",         label: "Razorpay Key ID" },
      { key: "razorpay_key_secret",     label: "Razorpay Key Secret",     type: "secret" },
      { key: "razorpay_webhook_secret", label: "Razorpay Webhook Secret", type: "secret" },
    ],
  },
  {
    label: "Referral Commission",
    icon: BarChart3,
    description: "Per-level AI trading referral commission percentages",
    keys: [
      { key: "referral_l1_ai_percent", label: "Level 1 Commission %", type: "number" },
      { key: "referral_l2_ai_percent", label: "Level 2 Commission %", type: "number" },
      { key: "referral_l3_ai_percent", label: "Level 3 Commission %", type: "number" },
      { key: "referral_l4_ai_percent", label: "Level 4 Commission %", type: "number" },
      { key: "referral_l5_ai_percent", label: "Level 5 Commission %", type: "number" },
    ],
  },
  {
    label: "Social Media",
    icon: Share2,
    description: "Platform social media profile links",
    keys: [
      { key: "social_twitter",   label: "Twitter / X URL" },
      { key: "social_telegram",  label: "Telegram URL" },
      { key: "social_instagram", label: "Instagram URL" },
      { key: "social_youtube",   label: "YouTube URL" },
      { key: "social_linkedin",  label: "LinkedIn URL" },
    ],
  },
];

export default function ExchangeSettings() {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const { data: serverSettings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["exchange-settings"],
    queryFn: () => get<Record<string, string>>("/admin/exchange-settings"),
    staleTime: 60_000,
  });

  const settings: Record<string, string> = useMemo(() => ({
    ...(serverSettings ?? {}),
    ...pendingChanges,
  }), [serverSettings, pendingChanges]);

  const saveSingleMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      put<void>("/admin/exchange-settings", { key, value }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ["exchange-settings"] });
      setSavedKeys(prev => { const n = new Set(prev); n.add(key); setTimeout(() => setSavedKeys(p => { const m = new Set(p); m.delete(key); return m; }), 3000); return n; });
      setPendingChanges(prev => { const n = { ...prev }; delete n[key]; return n; });
      toast.success(`Saved: ${key}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const saveBulkMutation = useMutation({
    mutationFn: (data: { settings: Record<string, string> }) =>
      post<void>("/admin/exchange-settings/bulk", data),
    onSuccess: (_, { settings: saved }) => {
      qc.invalidateQueries({ queryKey: ["exchange-settings"] });
      const keys = Object.keys(saved);
      setSavedKeys(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); setTimeout(() => setSavedKeys(p => { const m = new Set(p); keys.forEach(k => m.delete(k)); return m; }), 3000); return n; });
      setPendingChanges({});
      toast.success(`${keys.length} settings saved`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk save failed"),
  });

  const setValue = (key: string, value: string) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const saveSingle = (key: string) => {
    saveSingleMutation.mutate({ key, value: settings[key] ?? "" });
  };

  const saveBulk = (sectionKeys: string[]) => {
    const obj: Record<string, string> = {};
    sectionKeys.forEach(k => { if (settings[k] !== undefined) obj[k] = settings[k]; });
    saveBulkMutation.mutate({ settings: obj });
  };

  const totalChanges = Object.keys(pendingChanges).length;

  const isAnySaving = saveSingleMutation.isPending || saveBulkMutation.isPending;

  return (
    <div className="space-y-6 max-w-[1000px]">
      <PageHeader
        eyebrow="Configuration"
        title="Exchange Settings"
        description="Platform-wide configuration — features, limits, payment details, and credentials. Changes take effect immediately."
        actions={
          <div className="flex items-center gap-2">
            {totalChanges > 0 && (
              <Badge variant="secondary" className="text-amber-400 border-amber-500/30 bg-amber-500/10">
                {totalChanges} unsaved change{totalChanges !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["exchange-settings"] })}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Reload
            </Button>
            {totalChanges > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  const allPending: Record<string, string> = {};
                  SECTIONS.forEach(s => {
                    s.keys.forEach(({ key }) => {
                      if (pendingChanges[key] !== undefined) allPending[key] = pendingChanges[key];
                    });
                  });
                  saveBulkMutation.mutate({ settings: allPending });
                }}
                disabled={isAnySaving}
              >
                {isAnySaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Save all changes
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isCollapsed = collapsed[section.label];
            const sectionKeys = section.keys.map(k => k.key);
            const sectionPending = sectionKeys.filter(k => pendingChanges[k] !== undefined).length;
            const sectionSaved = sectionKeys.filter(k => savedKeys.has(k)).length;

            return (
              <div
                key={section.label}
                className={cn(
                  "rounded-xl border bg-card/50 overflow-hidden transition-all",
                  sectionPending > 0 ? "border-amber-500/40" : "border-border",
                )}
              >
                {/* Section header */}
                <button
                  onClick={() => setCollapsed(prev => ({ ...prev, [section.label]: !prev[section.label] }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center border",
                      sectionPending > 0
                        ? "bg-amber-500/15 border-amber-500/30"
                        : "bg-muted/40 border-border",
                    )}>
                      <Icon className={cn("w-4 h-4", sectionPending > 0 ? "text-amber-400" : "text-muted-foreground")} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{section.label}</span>
                        {sectionPending > 0 && (
                          <Badge className="h-4 px-1.5 text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                            {sectionPending} pending
                          </Badge>
                        )}
                        {sectionSaved > 0 && (
                          <Badge className="h-4 px-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            Saved
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{section.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isCollapsed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={e => { e.stopPropagation(); saveBulk(sectionKeys); }}
                        disabled={isAnySaving}
                      >
                        {saveBulkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Save section
                      </Button>
                    )}
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border/60 px-5 py-5 space-y-5">
                    {section.keys.map(({ key, label, type, hint }) => {
                      const val = settings[key] ?? "";
                      const isDirty = pendingChanges[key] !== undefined;
                      const isSaved = savedKeys.has(key);
                      const isSaving = saveSingleMutation.isPending && saveSingleMutation.variables?.key === key;

                      return (
                        <div key={key} className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Label className="text-sm font-medium">{label}</Label>
                              {isDirty && !isSaved && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved change" />
                              )}
                              {isSaved && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                            </div>
                            {hint && <div className="text-[11px] text-muted-foreground mb-1.5">{hint}</div>}

                            {type === "boolean" ? (
                              <div className="flex items-center gap-3 h-9">
                                <Switch
                                  checked={val === "true"}
                                  onCheckedChange={c => setValue(key, c ? "true" : "false")}
                                />
                                <span className={cn("text-sm", val === "true" ? "text-emerald-400 font-medium" : "text-muted-foreground")}>
                                  {val === "true" ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                            ) : type === "textarea" ? (
                              <Textarea
                                value={val}
                                onChange={e => setValue(key, e.target.value)}
                                rows={2}
                                className={cn("resize-none", isDirty && "border-amber-500/60")}
                              />
                            ) : type === "secret" ? (
                              <div className="relative">
                                <Input
                                  type={showSecrets[key] ? "text" : "password"}
                                  value={val}
                                  onChange={e => setValue(key, e.target.value)}
                                  className={cn("pr-9 font-mono text-xs", isDirty && "border-amber-500/60")}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }))}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {showSecrets[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            ) : (
                              <Input
                                type={type === "number" ? "number" : "text"}
                                value={val}
                                onChange={e => setValue(key, e.target.value)}
                                className={cn(isDirty && "border-amber-500/60")}
                              />
                            )}
                          </div>

                          {type !== "boolean" && (
                            <div className="flex-shrink-0 mt-6">
                              <Button
                                variant={isSaved ? "outline" : isDirty ? "default" : "outline"}
                                size="sm"
                                className={cn(
                                  "h-8 min-w-[64px] text-xs",
                                  isSaved && "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
                                )}
                                onClick={() => saveSingle(key)}
                                disabled={isSaving || isAnySaving}
                              >
                                {isSaving
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : isSaved
                                  ? <><CheckCircle2 className="w-3 h-3 mr-1" />Saved</>
                                  : <><Save className="w-3 h-3 mr-1" />Save</>
                                }
                              </Button>
                            </div>
                          )}
                          {type === "boolean" && isDirty && (
                            <div className="flex-shrink-0 mt-1">
                              <Button
                                variant="default"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => saveSingle(key)}
                                disabled={isSaving || isAnySaving}
                              >
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                                Apply
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
