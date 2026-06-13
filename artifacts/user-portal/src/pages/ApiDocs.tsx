import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Code2, Terminal, KeyRound, Zap, Globe, ArrowRight, ChevronRight,
  Copy, Check, ShieldCheck, Webhook, Network, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Section = { id: string; title: string; content: ReactNode };

const REST_BASE = "https://api.zebvix.com/v1";
const WS_BASE = "wss://stream.zebvix.com/ws";

function CodeBlock({ code, lang = "bash", id }: { code: string; lang?: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="not-prose group relative my-3 rounded-lg border border-border bg-card dark:bg-zinc-950/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{lang}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
          data-testid={`button-copy-${id}`}
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono leading-relaxed text-foreground overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
}

type Endpoint = { method: "GET" | "POST" | "DELETE" | "PUT"; path: string; auth: boolean; desc: string };
const PUBLIC_ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/markets", auth: false, desc: "List all trading symbols and 24h tickers" },
  { method: "GET", path: "/markets/{symbol}/orderbook", auth: false, desc: "Top-N orderbook snapshot" },
  { method: "GET", path: "/markets/{symbol}/trades", auth: false, desc: "Recent trades for a symbol" },
  { method: "GET", path: "/markets/{symbol}/klines", auth: false, desc: "Candlestick history (1m,5m,1h,1d…)" },
  { method: "GET", path: "/system/status", auth: false, desc: "Platform health & maintenance flags" },
  { method: "GET", path: "/system/time", auth: false, desc: "Server time (used to compute HMAC nonce)" },
];
const PRIVATE_ENDPOINTS: Endpoint[] = [
  { method: "GET",    path: "/account/balances", auth: true, desc: "Spot wallet balances" },
  { method: "GET",    path: "/account/positions", auth: true, desc: "Open futures positions" },
  { method: "POST",   path: "/orders", auth: true, desc: "Place a new order (limit, market, stop)" },
  { method: "GET",    path: "/orders/{id}", auth: true, desc: "Get an order by id" },
  { method: "DELETE", path: "/orders/{id}", auth: true, desc: "Cancel an open order" },
  { method: "DELETE", path: "/orders", auth: true, desc: "Cancel all open orders for a symbol" },
  { method: "GET",    path: "/orders/history", auth: true, desc: "Filled & cancelled orders (paged)" },
  { method: "POST",   path: "/transfers", auth: true, desc: "Internal transfer between sub-accounts / wallets" },
];

const METHOD_COLOR: Record<Endpoint["method"], string> = {
  GET:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST:   "bg-sky-500/15 text-sky-400 border-sky-500/30",
  DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  PUT:    "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const ERRORS: { code: number; name: string; meaning: string }[] = [
  { code: 400, name: "Bad Request", meaning: "Validation failed — see `errors[]` for details" },
  { code: 401, name: "Unauthorized", meaning: "Missing or invalid HMAC signature / API key" },
  { code: 403, name: "Forbidden", meaning: "Key lacks required permission, or IP not whitelisted" },
  { code: 404, name: "Not Found", meaning: "Resource (order, symbol, account) does not exist" },
  { code: 418, name: "Locked", meaning: "Account temporarily locked for security review" },
  { code: 429, name: "Too Many Requests", meaning: "Rate limit exceeded — back off and retry" },
  { code: 451, name: "Unavailable", meaning: "Service unavailable in your jurisdiction" },
  { code: 503, name: "Service Unavailable", meaning: "Engine in maintenance mode — retry shortly" },
];

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>
          The Zebvix Exchange API gives you programmatic access to public
          market data and (with an API key) to your account, orders,
          positions and transfers. The API is REST + WebSocket, JSON over
          HTTPS / WSS, and is designed for low-latency algorithmic trading.
        </p>
        <ul>
          <li><strong>REST base URL</strong> — <code>{REST_BASE}</code></li>
          <li><strong>WebSocket</strong> — <code>{WS_BASE}</code></li>
          <li><strong>Encoding</strong> — UTF-8 JSON; timestamps in milliseconds (epoch)</li>
          <li><strong>Time sync</strong> — keep your clock within 1 second of <code>GET /system/time</code></li>
        </ul>
      </>
    ),
  },
  {
    id: "auth",
    title: "Authentication (HMAC-SHA256)",
    content: (
      <>
        <p>
          Generate an API key from <Link href="/settings">Settings → Security → API keys</Link>.
          Each key has a public <code>API-Key</code> id and a private secret used to sign requests.
        </p>
        <p>Every authenticated request must include three headers:</p>
        <CodeBlock id="auth-headers" lang="http" code={`X-ZBX-APIKEY: <your-api-key>
X-ZBX-TIMESTAMP: <unix-millis>
X-ZBX-SIGN: <hex-hmac-sha256(secret, timestamp + method + path + body)>`} />
        <p>Example signing in Node.js:</p>
        <CodeBlock id="auth-node" lang="javascript" code={`import crypto from "node:crypto";

const API_KEY = process.env.ZBX_API_KEY;
const SECRET  = process.env.ZBX_API_SECRET;

function sign({ method, path, body = "" }) {
  const ts  = Date.now().toString();
  const msg = ts + method.toUpperCase() + path + body;
  const sig = crypto.createHmac("sha256", SECRET).update(msg).digest("hex");
  return { "X-ZBX-APIKEY": API_KEY, "X-ZBX-TIMESTAMP": ts, "X-ZBX-SIGN": sig };
}`} />
      </>
    ),
  },
  {
    id: "rate-limits",
    title: "Rate limits",
    content: (
      <>
        <p>Limits are per API key, applied as a sliding 60-second window:</p>
        <ul>
          <li><strong>Public endpoints</strong> — 1,200 requests / minute</li>
          <li><strong>Private (order placement)</strong> — 100 requests / second, soft burst to 200 / second</li>
          <li><strong>WebSocket subscriptions</strong> — 200 streams per connection, 20 connections per key</li>
        </ul>
        <p>
          When you hit a limit you'll receive HTTP <strong>429</strong> with a{" "}
          <code>Retry-After</code> header. Persistent abuse may result in a
          temporary 5-minute key suspension.
        </p>
      </>
    ),
  },
  {
    id: "public-endpoints",
    title: "Public REST endpoints",
    content: (
      <>
        <EndpointTable endpoints={PUBLIC_ENDPOINTS} />
        <h3 className="!mt-6">Example — fetch the BTC/USDT orderbook</h3>
        <CodeBlock id="public-curl" lang="bash" code={`curl -s "${REST_BASE}/markets/BTC-USDT/orderbook?depth=20" | jq`} />
      </>
    ),
  },
  {
    id: "private-endpoints",
    title: "Private REST endpoints",
    content: (
      <>
        <EndpointTable endpoints={PRIVATE_ENDPOINTS} />
        <h3 className="!mt-6">Example — place a limit buy</h3>
        <CodeBlock id="place-order" lang="bash" code={`curl -X POST "${REST_BASE}/orders" \\
  -H "Content-Type: application/json" \\
  -H "X-ZBX-APIKEY: $ZBX_API_KEY" \\
  -H "X-ZBX-TIMESTAMP: $TS" \\
  -H "X-ZBX-SIGN: $SIG" \\
  -d '{
    "symbol": "BTC-USDT",
    "side":   "BUY",
    "type":   "LIMIT",
    "price":  "62500.00",
    "qty":    "0.005",
    "tif":    "GTC",
    "clientOrderId": "myapp-12345"
  }'`} />
      </>
    ),
  },
  {
    id: "websocket",
    title: "WebSocket streams",
    content: (
      <>
        <p>Connect to <code>{WS_BASE}</code> and send a JSON subscribe message:</p>
        <CodeBlock id="ws-sub" lang="json" code={`{
  "id": 1,
  "op": "subscribe",
  "args": [
    "ticker.BTC-USDT",
    "depth20.BTC-USDT",
    "trade.BTC-USDT",
    "kline.1m.BTC-USDT"
  ]
}`} />
        <p>Authenticated streams (account, orders, positions) require an extra <code>auth</code> message:</p>
        <CodeBlock id="ws-auth" lang="json" code={`{
  "id": 2,
  "op": "auth",
  "args": {
    "apiKey":    "<your-api-key>",
    "timestamp": 1714123456789,
    "signature": "<hex-hmac-sha256(secret, timestamp + 'WSAUTH')>"
  }
}`} />
        <p>
          The server pings every 30s — your client must respond with a pong
          frame within 10s or the connection will be closed.
        </p>
      </>
    ),
  },
  {
    id: "errors",
    title: "Error codes",
    content: (
      <>
        <p>All error responses follow a consistent shape:</p>
        <CodeBlock id="error-shape" lang="json" code={`{
  "ok": false,
  "code": "INSUFFICIENT_BALANCE",
  "message": "Available 12.30 USDT is less than required 50.00 USDT",
  "requestId": "req_01HX6YY0JTZ8M5"
}`} />
        <div className="not-prose overflow-x-auto rounded-lg border border-border my-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-3 py-2.5">HTTP</th>
                <th className="text-left font-semibold px-3 py-2.5">Name</th>
                <th className="text-left font-semibold px-3 py-2.5">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ERRORS.map((e) => (
                <tr key={e.code} className="hover:bg-accent/20">
                  <td className="px-3 py-2.5 font-mono">{e.code}</td>
                  <td className="px-3 py-2.5 font-semibold">{e.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{e.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "sdks",
    title: "Official SDKs",
    content: (
      <>
        <ul>
          <li><strong>Node.js / TypeScript</strong> — <code>npm i @zebvix/sdk</code></li>
          <li><strong>Python</strong> — <code>pip install zebvix</code></li>
          <li><strong>Go</strong> — <code>go get github.com/zebvix/go-sdk</code></li>
          <li><strong>Java / Kotlin</strong> — Maven / Gradle on Maven Central</li>
        </ul>
        <p>
          All SDKs handle HMAC signing, automatic time-sync, request retries
          with jittered back-off, WebSocket reconnection, and typed
          response models.
        </p>
      </>
    ),
  },
  {
    id: "best-practices",
    title: "Best practices",
    content: (
      <>
        <ul>
          <li>Whitelist the IPs your bot trades from — every API key supports up to 5 IPs;</li>
          <li>Use <strong>read-only</strong> keys for analytics; reserve <strong>trade</strong> permission for the executing service;</li>
          <li>Never enable <strong>withdraw</strong> permission unless you absolutely need it; if you do, also require IP whitelist + 2FA;</li>
          <li>Set a unique <code>clientOrderId</code> on every new order so reconnect logic can be idempotent;</li>
          <li>Subscribe to the private order stream and treat REST polling as a fallback, not the primary signal;</li>
          <li>Implement exponential back-off on 429 / 503 — never hammer a degraded engine;</li>
          <li>Rotate API keys at least every 90 days; old keys can be revoked immediately from <Link href="/settings">Settings</Link>.</li>
        </ul>
      </>
    ),
  },
];

function EndpointTable({ endpoints }: { endpoints: Endpoint[] }) {
  return (
    <div className="not-prose overflow-x-auto rounded-lg border border-border my-3">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left font-semibold px-3 py-2.5 w-20">Method</th>
            <th className="text-left font-semibold px-3 py-2.5">Path</th>
            <th className="text-left font-semibold px-3 py-2.5">Auth</th>
            <th className="text-left font-semibold px-3 py-2.5">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {endpoints.map((e) => (
            <tr key={`${e.method}-${e.path}`} className="hover:bg-accent/20">
              <td className="px-3 py-2.5">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${METHOD_COLOR[e.method]}`}>
                  {e.method}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs">{e.path}</td>
              <td className="px-3 py-2.5">
                {e.auth ? (
                  <span className="text-amber-400 text-xs inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> Signed</span>
                ) : (
                  <span className="text-muted-foreground text-xs">Public</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiDocs() {
  const [activeId, setActiveId] = useState(SECTIONS[0]?.id ?? "");
  useEffect(() => {
    const onScroll = () => {
      const fromTop = window.scrollY + 140;
      let current = SECTIONS[0]?.id ?? "";
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.offsetTop <= fromTop) current = s.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-api-docs">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-sky-500/10 via-card to-card p-8 md:p-12 mb-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-3 bg-background/50">
            <Code2 className="h-3 w-3 mr-1.5 text-primary" /> API Documentation
          </Badge>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
            Build on Zebvix.{" "}
            <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
              Trade programmatically.
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-5">
            Low-latency REST + WebSocket APIs for spot and perpetual
            futures, with signed authentication, granular permissions,
            and official SDKs for Node, Python, Go, and Java.
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            <Badge variant="secondary"><Zap className="h-3 w-3 mr-1" /> Sub-ms matching</Badge>
            <Badge variant="secondary"><ShieldCheck className="h-3 w-3 mr-1" /> HMAC-SHA256 signed</Badge>
            <Badge variant="secondary"><Webhook className="h-3 w-3 mr-1" /> WebSocket streams</Badge>
            <Badge variant="secondary"><Network className="h-3 w-3 mr-1" /> 1,200 req / min</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/settings">
              <Button data-testid="button-api-create-key" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Create API key <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <a href="https://github.com/zebvix" target="_blank" rel="noreferrer noopener">
              <Button variant="outline" data-testid="button-api-github">
                View SDKs on GitHub
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Quick start cards */}
      <section className="grid sm:grid-cols-3 gap-4 mb-10">
        <Card className="bg-card/40">
          <CardContent className="p-5">
            <Globe className="h-5 w-5 text-primary mb-2" />
            <div className="font-semibold mb-1">REST</div>
            <code className="text-xs text-muted-foreground break-all">{REST_BASE}</code>
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardContent className="p-5">
            <Webhook className="h-5 w-5 text-primary mb-2" />
            <div className="font-semibold mb-1">WebSocket</div>
            <code className="text-xs text-muted-foreground break-all">{WS_BASE}</code>
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardContent className="p-5">
            <Sparkles className="h-5 w-5 text-primary mb-2" />
            <div className="font-semibold mb-1">Status</div>
            <span className="text-xs text-success inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> All systems operational
            </span>
          </CardContent>
        </Card>
      </section>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* TOC */}
        <aside className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start order-2 lg:order-1">
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">
              Reference
            </div>
            <nav>
              <ol className="space-y-0.5">
                {SECTIONS.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                      >
                        <span className="text-xs tabular-nums opacity-60 w-5">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate">{s.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4 mt-4 text-xs text-muted-foreground space-y-2">
            <Terminal className="h-4 w-4 text-primary" />
            <div className="font-semibold text-foreground/90">Need help?</div>
            <p>API integration questions? Our developer-relations team responds within 24h.</p>
            <Link href="/support" className="inline-flex items-center text-primary hover:underline">
              Contact dev support <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>
        </aside>

        {/* Content */}
        <article className="lg:col-span-9 order-1 lg:order-2 space-y-12 leading-relaxed">
          {SECTIONS.map((s, i) => (
            <section id={s.id} key={s.id} className="scroll-mt-24">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight">{s.title}</h2>
              </div>
              <div className="prose prose-sm md:prose-base max-w-none text-foreground/90 [&_p]:my-3 [&_ul]:my-3 [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-xs [&_code]:font-mono">
                {s.content}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
