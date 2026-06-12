import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy, Search, Bot, MessageSquare, Send, Plus, Sparkles, Clock,
  CheckCircle2, X, Loader2, User as UserIcon, Shield, Landmark,
  ArrowDownCircle, ArrowUpCircle, TrendingUp, Coins, Gift, Lock,
  ChevronRight, AlertCircle, Mail, Phone,
} from "lucide-react";
import { get, post, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Faq = { q: string; a: string };
type FaqCategory = { category: string; icon: string; questions: Faq[] };

type Thread = {
  id: number;
  subject: string;
  status: string;
  lastMessageAt: string;
  createdAt: string;
  lastMessage: string;
  lastSenderRole: string;
};

type Message = {
  id: number;
  senderRole: string;
  message: string;
  createdAt: string;
};

type ThreadDetail = {
  id: number;
  subject: string;
  status: string;
  createdAt: string;
  lastMessageAt: string;
  messages: Message[];
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "shield-check": Shield,
  landmark: Landmark,
  "arrow-down-circle": ArrowDownCircle,
  "arrow-up-circle": ArrowUpCircle,
  "trending-up": TrendingUp,
  coins: Coins,
  gift: Gift,
  lock: Lock,
  user: UserIcon,
};

const SUGGESTIONS = [
  "Why is my deposit pending?",
  "How do I complete KYC Level 2?",
  "How do I add a bank account?",
  "How does the referral program work?",
  "How do I enable 2FA?",
  "What are the trading fees?",
];

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Support() {
  const [tab, setTab] = useState<"help" | "chat" | "tickets">("help");
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen pb-12">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6">
        {/* Hero */}
        <Card className="relative overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-zinc-950 p-6 md:p-8" data-testid="support-hero">
          <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute -left-10 bottom-0 w-48 h-48 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 mb-3">
                <Sparkles className="h-3 w-3 mr-1" /> 24/7 Support
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">
                How can we <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">help you?</span>
              </h1>
              <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl">
                Get instant answers from <b className="text-amber-300">Zara</b>, our AI assistant — or open a ticket for issues that need a human review.
              </p>
              <div className="mt-4 relative max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search help articles… (KYC, deposit, withdraw, bank…)"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); if (e.target.value) setTab("help"); }}
                  className="pl-10 h-11 bg-zinc-950/70 border-border"
                  data-testid="input-help-search"
                />
              </div>
            </div>
            <div className="hidden md:flex flex-col gap-2 min-w-[220px]">
              <Card className="bg-zinc-950/70 border-border p-3 cursor-pointer hover:border-amber-500/40 transition-colors" onClick={() => setTab("chat")} data-testid="card-quick-chat">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Chat with Zara</div>
                    <div className="text-[11px] text-muted-foreground">AI · instant reply</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
              <Card className="bg-zinc-950/70 border-border p-3 cursor-pointer hover:border-amber-500/40 transition-colors" onClick={() => setTab("tickets")} data-testid="card-quick-ticket">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Open a ticket</div>
                    <div className="text-[11px] text-muted-foreground">Human agent · 24h</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-5">
          <TabsList className="grid grid-cols-3 w-full md:w-auto md:inline-grid bg-card border border-border">
            <TabsTrigger value="help" data-testid="tab-help">
              <LifeBuoy className="h-4 w-4 mr-1.5" /> Help Center
            </TabsTrigger>
            <TabsTrigger value="chat" data-testid="tab-chat">
              <Bot className="h-4 w-4 mr-1.5" /> Live Chat
            </TabsTrigger>
            <TabsTrigger value="tickets" data-testid="tab-tickets">
              <MessageSquare className="h-4 w-4 mr-1.5" /> My Tickets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="help" className="mt-4">
            <HelpCenter search={search} />
          </TabsContent>

          <TabsContent value="chat" className="mt-4">
            <LiveChat />
          </TabsContent>

          <TabsContent value="tickets" className="mt-4">
            <Tickets />
          </TabsContent>
        </Tabs>

        {/* Footer contact strip */}
        <Card className="mt-6 p-4 border-border bg-gradient-to-r from-zinc-950 to-zinc-900">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Still need help? Our human team is on standby.
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="mailto:support@zebvix.com" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors text-xs">
                <Mail className="h-3.5 w-3.5 text-amber-400" /> support@zebvix.com
              </a>
              <a href="tel:+911800123456" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors text-xs">
                <Phone className="h-3.5 w-3.5 text-amber-400" /> 1800 123 456
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────── Help Center ─────────────────────────────────

function HelpCenter({ search }: { search: string }) {
  const faqQ = useQuery<{ items: FaqCategory[] }>({
    queryKey: ["/support/faqs"],
    queryFn: () => get("/support/faqs"),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const items = faqQ.data?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items
      .map((cat) => ({
        ...cat,
        questions: cat.questions.filter(
          (q) => q.q.toLowerCase().includes(term) || q.a.toLowerCase().includes(term),
        ),
      }))
      .filter((cat) => cat.questions.length > 0);
  }, [faqQ.data, search]);

  if (faqQ.isLoading) {
    return <div className="text-sm text-muted-foreground py-10 text-center">Loading help articles…</div>;
  }
  if (filtered.length === 0) {
    return (
      <Card className="p-10 text-center border-border" data-testid="empty-search">
        <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <div className="font-semibold">No articles match "{search}"</div>
        <div className="text-xs text-muted-foreground mt-1">Try the AI chat — Zara can answer custom questions.</div>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4" data-testid="faq-grid">
      {filtered.map((cat) => {
        const Icon = ICONS[cat.icon] ?? LifeBuoy;
        return (
          <Card key={cat.category} className="p-5 border-border" data-testid={`faq-cat-${cat.category.toLowerCase()}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <Icon className="h-4 w-4 text-amber-400" />
              </div>
              <h3 className="font-bold">{cat.category}</h3>
              <Badge variant="outline" className="ml-auto text-[10px] border-border">{cat.questions.length}</Badge>
            </div>
            <Accordion type="single" collapsible>
              {cat.questions.map((q, i) => (
                <AccordionItem key={i} value={`${cat.category}-${i}`} className="border-border/60">
                  <AccordionTrigger className="text-sm font-medium text-left hover:text-amber-400">{q.q}</AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed">{q.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Live AI Chat ────────────────────────────────

type LiveMsg = { role: "user" | "assistant"; content: string; ts: number };

function LiveChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<LiveMsg[]>(() => [
    {
      role: "assistant",
      content: `Hi ${user?.fullName?.split(" ")[0] || "there"}! I'm Zara, your Zebvix support assistant. I can help with KYC, deposits, withdrawals, banks, trading fees, referrals, and more. What can I help you with?`,
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");
    const next: LiveMsg[] = [...messages, { role: "user", content: msg, ts: Date.now() }];
    setMessages(next);
    try {
      const history = next.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const r = await post<{ reply: string }>("/support/ai-chat", { message: msg, history });
      setMessages((curr) => [...curr, { role: "assistant", content: r.reply, ts: Date.now() }]);
    } catch (e: any) {
      const errMsg = e instanceof ApiError ? (e.data?.reply || e.message) : "Network error. Please try again.";
      setMessages((curr) => [...curr, { role: "assistant", content: errMsg, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="border-border overflow-hidden" data-testid="live-chat">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-amber-500/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-black">
              <Bot className="h-5 w-5" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-zinc-950" />
          </div>
          <div>
            <div className="font-semibold text-sm">Zara · AI Assistant</div>
            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online · usually replies instantly
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-300 hidden md:inline-flex">
          <Sparkles className="h-3 w-3 mr-1" /> Powered by AI
        </Badge>
      </div>

      <div ref={scrollRef} className="h-[460px] overflow-y-auto px-4 py-4 space-y-3 bg-zinc-950/30" data-testid="chat-scroll">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}
        {sending && <Bubble role="assistant" content="" typing />}
      </div>

      {messages.length <= 1 && (
        <div className="px-4 py-2 border-t border-border bg-zinc-950/50">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Suggested</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={sending}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-amber-500/40 hover:bg-amber-500/5 text-foreground/80 transition-colors"
                data-testid={`suggest-${s.slice(0, 12)}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-end gap-2 px-3 py-3 border-t border-border bg-zinc-950/50"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Type your question…"
          rows={1}
          className="min-h-[40px] max-h-32 resize-none bg-card border-border"
          disabled={sending}
          data-testid="input-chat-message"
        />
        <Button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 h-10 px-4"
          data-testid="button-send-chat"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </Card>
  );
}

function renderMsgContent(text: string) {
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (t.startsWith("• ") || t.startsWith("- ")) {
      return <div key={i} className="flex gap-1.5 mt-0.5"><span className="text-amber-400 mt-0.5 flex-shrink-0">•</span><span>{t.slice(2)}</span></div>;
    }
    if (/^\d+\.\s/.test(t)) {
      const dot = t.indexOf(". ");
      return <div key={i} className="flex gap-1.5 mt-0.5"><span className="text-amber-400 flex-shrink-0 font-semibold">{t.slice(0, dot)}.</span><span>{t.slice(dot + 2)}</span></div>;
    }
    if (t === "") return <div key={i} className="h-1.5" />;
    return <div key={i}>{line}</div>;
  });
}

function Bubble({ role, content, typing }: { role: "user" | "assistant"; content: string; typing?: boolean }) {
  const isAi = role === "assistant";
  return (
    <div className={`flex gap-2 ${isAi ? "justify-start" : "justify-end"}`} data-testid={`bubble-${role}`}>
      {isAi && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black flex-shrink-0 mt-0.5 shadow-md shadow-amber-500/20">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isAi ? "bg-card border border-border text-zinc-100 rounded-tl-sm" : "bg-gradient-to-br from-amber-400 to-orange-500 text-black font-medium rounded-tr-sm shadow-md shadow-amber-500/10"}`}>
        {typing ? (
          <span className="inline-flex gap-1.5 py-0.5 items-center">
            <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: "160ms" }} />
            <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: "320ms" }} />
          </span>
        ) : isAi ? renderMsgContent(content) : content}
      </div>
      {!isAi && (
        <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold text-muted-foreground">U</div>
      )}
    </div>
  );
}

// ─────────────────────────── Tickets ─────────────────────────────────────

function Tickets() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const threadsQ = useQuery<{ items: Thread[] }>({
    queryKey: ["/support/threads"],
    queryFn: () => get("/support/threads"),
  });

  const items = threadsQ.data?.items ?? [];

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <Card className="border-border p-3" data-testid="ticket-list">
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm">Your tickets</div>
          <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 h-7" onClick={() => setCreateOpen(true)} data-testid="button-new-ticket">
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        </div>
        {threadsQ.isLoading ? (
          <div className="text-xs text-muted-foreground py-6 text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center" data-testid="empty-tickets">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-2">
              <MessageSquare className="h-5 w-5 text-amber-400" />
            </div>
            <div className="font-semibold text-sm">No tickets yet</div>
            <div className="text-xs text-muted-foreground mt-1">Open one for issues that need a human.</div>
          </div>
        ) : (
          <ScrollArea className="h-[460px] pr-2">
            <div className="space-y-1.5">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenId(t.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${openId === t.id ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:border-border"}`}
                  data-testid={`ticket-${t.id}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex-1 min-w-0 font-semibold text-xs line-clamp-1">{t.subject}</div>
                    <Badge variant="outline" className={`text-[9px] shrink-0 ${t.status === "open" ? "border-emerald-500/30 text-emerald-300" : "border-border text-muted-foreground"}`}>
                      {t.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{t.lastMessage || "No messages"}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> {timeAgo(t.lastMessageAt)}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      <Card className="border-border min-h-[520px]" data-testid="ticket-pane">
        {openId == null ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center mb-3">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="font-semibold">Select a ticket to view</div>
            <div className="text-xs text-muted-foreground mt-1">Or create a new one to get started.</div>
            <Button className="mt-4 bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New ticket
            </Button>
          </div>
        ) : (
          <ThreadView id={openId} onClose={() => setOpenId(null)} />
        )}
      </Card>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["/support/threads"] });
          setOpenId(id);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function ThreadView({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const threadQ = useQuery<ThreadDetail>({
    queryKey: ["/support/threads", id],
    queryFn: () => get(`/support/threads/${id}`),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [threadQ.data?.messages.length, sending]);

  const sendM = useMutation({
    mutationFn: (message: string) => post<{ aiReply: Message }>(`/support/threads/${id}/messages`, { message }),
    onMutate: async () => { setSending(true); },
    onSettled: () => {
      setSending(false);
      qc.invalidateQueries({ queryKey: ["/support/threads", id] });
      qc.invalidateQueries({ queryKey: ["/support/threads"] });
    },
    onError: (e: any) => { toast.error(e?.message || "Send failed"); },
  });

  const closeM = useMutation({
    mutationFn: () => post(`/support/threads/${id}/close`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/support/threads", id] });
      qc.invalidateQueries({ queryKey: ["/support/threads"] });
      toast.success("Ticket closed");
    },
  });

  function send() {
    const m = input.trim();
    if (!m || sending) return;
    setInput("");
    sendM.mutate(m);
  }

  if (threadQ.isLoading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Loading ticket…</div>;
  }
  if (!threadQ.data) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Ticket not found.</div>;
  }

  const t = threadQ.data;

  return (
    <div className="flex flex-col h-[560px]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={onClose}><X className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs line-clamp-1">{t.subject}</div>
          <div className="text-[10px] text-muted-foreground">Ticket #{t.id} · {timeAgo(t.createdAt)}</div>
        </div>
        <Badge variant="outline" className={`text-[10px] ${t.status === "open" ? "border-emerald-500/30 text-emerald-300" : "border-border text-muted-foreground"}`}>{t.status}</Badge>
        {t.status === "open" && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-rose-400" onClick={() => closeM.mutate()} data-testid="button-close-ticket">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-zinc-950/30">
        {t.messages.map((m) => (
          <ThreadBubble key={m.id} m={m} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-black flex-shrink-0 mr-2">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-card border border-border">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {t.status === "open" ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 px-3 py-3 border-t border-border bg-zinc-950/50">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Reply to this ticket…"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none bg-card border-border"
            disabled={sending}
            data-testid="input-ticket-message"
          />
          <Button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 h-10 px-4"
            data-testid="button-send-ticket"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      ) : (
        <div className="px-4 py-3 border-t border-border text-center text-xs text-muted-foreground">
          This ticket is closed. Open a new one if you need further help.
        </div>
      )}
    </div>
  );
}

function ThreadBubble({ m }: { m: Message }) {
  const isUser = m.senderRole === "user";
  const isAi = m.senderRole === "ai";
  const isSupport = m.senderRole === "support" || m.senderRole === "admin";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 ${isAi ? "bg-gradient-to-br from-amber-500 to-orange-500 text-black" : "bg-sky-500/20 text-sky-300 border border-sky-500/40"}`}>
          {isAi ? <Bot className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
        </div>
      )}
      <div className="max-w-[78%]">
        {!isUser && (
          <div className="text-[10px] text-muted-foreground mb-0.5 px-1">
            {isAi ? "Zara · AI" : isSupport ? "Support agent" : m.senderRole}
          </div>
        )}
        <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${isUser ? "bg-gradient-to-br from-amber-500 to-orange-500 text-black font-medium rounded-tr-sm" : "bg-card border border-border text-zinc-100 rounded-tl-sm"}`}>
          {m.message}
        </div>
        <div className={`text-[9px] text-muted-foreground mt-0.5 px-1 ${isUser ? "text-right" : ""}`}>{timeAgo(m.createdAt)}</div>
      </div>
    </div>
  );
}

function CreateTicketDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!open) { setSubject(""); setMessage(""); } }, [open]);

  async function submit() {
    if (!subject.trim() || !message.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await post<{ id: number }>("/support/threads", { subject, message });
      toast.success("Ticket created — Zara is preparing the first reply.");
      onCreated(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-amber-400" /> Open a new ticket</DialogTitle>
          <DialogDescription>Describe your issue. Zara replies instantly; a human agent picks it up if needed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Subject</label>
            <Input
              placeholder="e.g. Withdrawal pending for 2 hours"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              data-testid="input-ticket-subject"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Describe your issue</label>
            <Textarea
              placeholder="Include relevant details: txn ID / order ID / time / amount / coin or pair…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              data-testid="input-ticket-body"
            />
            <div className="text-[10px] text-muted-foreground text-right mt-1">{message.length} / 4000</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !subject.trim() || !message.trim()}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400"
            data-testid="button-submit-ticket"
          >
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : <><Send className="h-4 w-4 mr-2" /> Submit ticket</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
