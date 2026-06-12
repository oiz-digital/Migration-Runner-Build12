import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Plus, Copy, Check, AlertTriangle, Trash2, Power, PowerOff,
  ShieldCheck, Loader2, Clock, MapPin, Eye, BookOpen, ExternalLink,
} from "lucide-react";
import { get, post, del, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Permission = "read" | "trade" | "withdraw";

type ApiKey = {
  id: number;
  name: string;
  keyId: string;
  secretPreview: string;
  permissions: Permission[];
  ipWhitelist: string[];
  status: "active" | "disabled";
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type ListResp = { keys: ApiKey[] };
type CreateResp = { key: ApiKey; secret: string };

const PERM_DESC: Record<Permission, { title: string; desc: string; tone: string }> = {
  read:     { title: "Read",     desc: "View account info, balances, orders, trade history.",                tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  trade:    { title: "Trade",    desc: "Place and cancel spot/futures orders. Cannot withdraw funds.",       tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  withdraw: { title: "Withdraw", desc: "Initiate crypto/INR withdrawals. ⚠ Requires 2FA. IP whitelist strongly recommended.", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

function relTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleString();
  const m = Math.floor(ms / 60000);
  if (m < 1)   return "Just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function permBadge(p: Permission) {
  const cfg = PERM_DESC[p];
  return <Badge key={p} className={`${cfg.tone} text-[10px] border`} variant="outline">{cfg.title}</Badge>;
}

export default function ApiKeysTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [showSecret, setShowSecret] = useState<CreateResp | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiKey | null>(null);

  const listQ = useQuery<ListResp>({
    queryKey: ["/account/api-keys"],
    queryFn: () => get<ListResp>("/account/api-keys"),
  });

  const toggleM = useMutation({
    mutationFn: async (k: ApiKey) => {
      const action = k.status === "active" ? "disable" : "enable";
      return post(`/account/api-keys/${k.id}/${action}`, {});
    },
    onSuccess: (_, k) => {
      qc.invalidateQueries({ queryKey: ["/account/api-keys"] });
      toast.success(k.status === "active" ? "Key disabled" : "Key enabled");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err) || "Action failed"),
  });

  const deleteM = useMutation({
    mutationFn: async (id: number) => del(`/account/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/account/api-keys"] });
      toast.success("Key deleted");
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err) || "Delete failed"),
  });

  const keys = listQ.data?.keys ?? [];

  return (
    <div className="space-y-4">
      {/* Intro / docs link */}
      <Card className="p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/20 text-amber-400">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base">API keys for programmatic access</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create signed API keys to access your account from bots, scripts, or third-party tools.
              Every request is HMAC-SHA256 signed — there's no password sent over the wire.
              Each key has its own permissions, optional IP whitelist, and optional expiry.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href="/docs/api" className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" /> Read API docs <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
                onClick={() => setCreateOpen(true)}
                data-testid="button-create-api-key"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Create new key
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Active keys list */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Your API keys
            {keys.length > 0 && <Badge variant="outline" className="text-[10px]">{keys.length}</Badge>}
          </h3>
          {listQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {!listQ.isLoading && keys.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No API keys yet.</p>
            <p className="text-xs mt-1">Create your first key to start using the Zebvix REST/WebSocket API.</p>
          </div>
        )}

        <div className="space-y-3">
          {keys.map((k) => (
            <div
              key={k.id}
              className={`rounded-lg border p-4 ${k.status === "active" ? "border-border" : "border-rose-500/20 bg-rose-500/5"}`}
              data-testid={`api-key-row-${k.id}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm">{k.name}</div>
                    {k.status === "active" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[10px]">ACTIVE</Badge>
                    ) : (
                      <Badge className="bg-rose-500/15 text-rose-400 border-transparent text-[10px]">DISABLED</Badge>
                    )}
                    {k.expiresAt && new Date(k.expiresAt) < new Date() && (
                      <Badge className="bg-rose-500/15 text-rose-400 border-transparent text-[10px]">EXPIRED</Badge>
                    )}
                    {k.permissions.map(permBadge)}
                  </div>
                  <div className="mt-2 font-mono text-xs text-muted-foreground break-all">
                    {k.keyId} <span className="text-muted-foreground/50">· secret …{k.secretPreview}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Last used: {relTime(k.lastUsedAt)}{k.lastUsedIp ? ` · ${k.lastUsedIp}` : ""}</span>
                    <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Created: {relTime(k.createdAt)}</span>
                    {k.expiresAt && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Expires: {new Date(k.expiresAt).toLocaleDateString()}</span>}
                    {k.ipWhitelist.length > 0 && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {k.ipWhitelist.length} whitelisted IP{k.ipWhitelist.length > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleM.mutate(k)}
                    disabled={toggleM.isPending}
                    data-testid={`button-toggle-${k.id}`}
                  >
                    {k.status === "active" ? (
                      <><PowerOff className="h-3.5 w-3.5 mr-1" /> Disable</>
                    ) : (
                      <><Power className="h-3.5 w-3.5 mr-1" /> Enable</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                    onClick={() => setConfirmDelete(k)}
                    data-testid={`button-delete-${k.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Create dialog */}
      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(resp) => {
          qc.invalidateQueries({ queryKey: ["/account/api-keys"] });
          setCreateOpen(false);
          setShowSecret(resp);
        }}
      />

      {/* One-time secret reveal */}
      <SecretRevealDialog
        data={showSecret}
        onClose={() => setShowSecret(null)}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this API key?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{confirmDelete?.name}</span> ({confirmDelete?.keyId}) will be permanently removed.
              Any application using it will start getting 401 errors immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-600"
              onClick={() => confirmDelete && deleteM.mutate(confirmDelete.id)}
              disabled={deleteM.isPending}
            >
              {deleteM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Create dialog
// ────────────────────────────────────────────────────────────

function CreateKeyDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (resp: CreateResp) => void;
}) {
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Record<Permission, boolean>>({ read: true, trade: false, withdraw: false });
  const [ipText, setIpText] = useState("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState("90");

  const reset = () => {
    setName("");
    setPerms({ read: true, trade: false, withdraw: false });
    setIpText("");
    setUseExpiry(false);
    setExpiryDays("90");
  };

  const createM = useMutation({
    mutationFn: async () => {
      const permissions = (Object.keys(perms) as Permission[]).filter((p) => perms[p]);
      const ipWhitelist = ipText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const expiresInDays = useExpiry ? Math.max(1, Math.min(365, Number(expiryDays) || 90)) : undefined;
      return post<CreateResp>("/account/api-keys", { name: name.trim(), permissions, ipWhitelist: ipWhitelist.length ? ipWhitelist : undefined, expiresInDays });
    },
    onSuccess: (resp) => { onCreated(resp); reset(); },
    onError: (err) => {
      const msg = err instanceof ApiError ? (err.data as { hint?: string; error?: string })?.hint || (err.data as { error?: string })?.error || err.message : String(err);
      toast.error(msg || "Could not create key");
    },
  });

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const anyPerm = Object.values(perms).some(Boolean);
  const valid = name.trim().length > 0 && anyPerm;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Create API key</DialogTitle>
          <DialogDescription>
            The secret will be shown only once — copy it before closing the next dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="apikey-name">Label</Label>
            <Input
              id="apikey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. trading-bot-1"
              maxLength={60}
              data-testid="input-api-key-name"
            />
            <p className="text-[11px] text-muted-foreground mt-1">A name for you to recognise this key. Not sent in requests.</p>
          </div>

          <div>
            <Label className="mb-2 block">Permissions</Label>
            <div className="space-y-2">
              {(Object.keys(PERM_DESC) as Permission[]).map((p) => (
                <label
                  key={p}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${perms[p] ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:bg-muted/40"}`}
                >
                  <Switch
                    checked={perms[p]}
                    onCheckedChange={(v) => setPerms((s) => ({ ...s, [p]: v }))}
                    data-testid={`switch-perm-${p}`}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {PERM_DESC[p].title}
                      {p === "withdraw" && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{PERM_DESC[p].desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="apikey-ips">IP whitelist (optional)</Label>
            <Input
              id="apikey-ips"
              value={ipText}
              onChange={(e) => setIpText(e.target.value)}
              placeholder="1.2.3.4, 5.6.7.8"
              data-testid="input-api-key-ips"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Comma- or space-separated. Requests from any other IP will be rejected. Leave blank to allow any IP.
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-expire this key</Label>
              <p className="text-[11px] text-muted-foreground">Set an expiry to limit blast radius if the key leaks.</p>
            </div>
            <Switch checked={useExpiry} onCheckedChange={setUseExpiry} data-testid="switch-expiry" />
          </div>
          {useExpiry && (
            <div>
              <Label htmlFor="apikey-days">Expires in (days)</Label>
              <Input
                id="apikey-days"
                type="number"
                min={1}
                max={365}
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                data-testid="input-api-key-days"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={createM.isPending}>Cancel</Button>
          <Button
            onClick={() => createM.mutate()}
            disabled={!valid || createM.isPending}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
            data-testid="button-confirm-create"
          >
            {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────
// Secret reveal dialog (one-time)
// ────────────────────────────────────────────────────────────

function CopyableField({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 font-mono text-xs bg-muted rounded p-2 break-all" data-testid={testId}>{value}</code>
        <Button variant="outline" size="sm" onClick={onCopy} className="flex-shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function SecretRevealDialog({ data, onClose }: { data: CreateResp | null; onClose: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const handleClose = (v: boolean) => {
    if (!v) {
      setAcknowledged(false);
      onClose();
    }
  };
  return (
    <Dialog open={!!data} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <Eye className="h-4 w-4" /> Save your secret now
          </DialogTitle>
          <DialogDescription>
            This is the <strong className="text-foreground">only</strong> time you'll see the secret.
            We never store it in plaintext, so we can't show it to you again.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                Treat the secret like a password. Anyone with both the key id and secret can sign requests on your behalf
                (limited to the permissions you granted).
              </div>
            </div>

            <CopyableField label="API key" value={data.key.keyId} testId="text-new-api-key" />
            <CopyableField label="Secret"  value={data.secret} testId="text-new-api-secret" />

            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="rounded"
                data-testid="checkbox-acknowledge-saved"
              />
              I have saved the secret in a safe place.
            </label>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => handleClose(false)}
            disabled={!acknowledged}
            data-testid="button-close-secret"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
