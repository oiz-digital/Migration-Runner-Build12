/**
 * Zebvix Platform — PREMIUM Brochure PDF Generator (pdfkit)
 * Run: node scripts/generate-brochure.mjs
 */
import PDFDocument from "pdfkit";
import { createWriteStream, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, "..");
const ASSETS = resolve(ROOT, "attached_assets/features");
const OUT    = resolve(ROOT, "docs/Zebvix-Platform-Brochure.pdf");
mkdirSync(resolve(ROOT, "docs"), { recursive: true });

// ── colours ────────────────────────────────────────────────
const C = {
  bg:      "#080808",
  bg2:     "#0d0d0d",
  amber:   "#f59e0b",
  amber2:  "#d97706",
  orange:  "#f97316",
  green:   "#10b981",
  blue:    "#3b82f6",
  white:   "#ffffff",
  light:   "#e5e5e5",
  muted:   "#9ca3af",
  dim:     "#4b5563",
  darker:  "#374151",
  card:    "#101010",
  card2:   "#141414",
  border:  "#1f1f1f",
  border2: "#2a2a2a",
  gold1:   "#1c1000",
  gold2:   "#3d2600",
  gold3:   "#fde68a",
};

function imgPath(name) {
  const p = resolve(ASSETS, name);
  return existsSync(p) ? p : null;
}

const doc = new PDFDocument({
  size: "A4", margin: 0,
  info: {
    Title:   "Zebvix Platform Brochure 2026",
    Author:  "Zebvix Technologies Private Limited",
    Subject: "Full Platform Presentation Brochure",
  },
});
doc.pipe(createWriteStream(OUT));

const W = doc.page.width;   // 595.28
const H = doc.page.height;  // 841.89
const M  = 36;               // margin
const CW = W - M * 2;       // content width

// ── low-level helpers ───────────────────────────────────────
const save  = () => doc.save();
const rest  = () => doc.restore();

function fillR(x, y, w, h, color) {
  save(); doc.rect(x,y,w,h).fill(color); rest();
}
function roundFill(x, y, w, h, r, color) {
  save(); doc.roundedRect(x,y,w,h,r).fill(color); rest();
}
function roundStroke(x, y, w, h, r, color, lw = 0.5) {
  save(); doc.roundedRect(x,y,w,h,r).lineWidth(lw).stroke(color); rest();
}
function roundBox(x, y, w, h, r, fill, strokeC, lw=0.5) {
  if (fill)   roundFill  (x,y,w,h,r,fill);
  if (strokeC) roundStroke(x,y,w,h,r,strokeC,lw);
}
function hline(x1,x2,y,color=C.border,lw=0.5) {
  save(); doc.moveTo(x1,y).lineTo(x2,y).lineWidth(lw).stroke(color); rest();
}
function vline(x,y1,y2,color=C.border,lw=0.5) {
  save(); doc.moveTo(x,y1).lineTo(x,y2).lineWidth(lw).stroke(color); rest();
}

// gradient helper — vertical, two stops
function gradV(x, y, w, h, c1, c2) {
  save();
  const g = doc.linearGradient(x,y,x,y+h);
  g.stop(0,c1,1); g.stop(1,c2,0.0);
  doc.rect(x,y,w,h).fill(g);
  rest();
}
function gradH(x, y, w, h, c1, c2) {
  save();
  const g = doc.linearGradient(x,y,x+w,y);
  g.stop(0,c1,1); g.stop(1,c2,0.0);
  doc.rect(x,y,w,h).fill(g);
  rest();
}

// ── text helpers ────────────────────────────────────────────
function T(str, x, y, opts={}) {
  const { size=10, color=C.light, font="Helvetica",
          w, align="left", gap=0 } = opts;
  save();
  doc.font(font).fontSize(size).fillColor(color);
  const o = { lineGap: gap };
  if (w)     o.width  = w;
  if (align) o.align  = align;
  doc.text(str, x, y, o);
  rest();
  return doc.y;
}
function B(str, x, y, opts={}) { return T(str,x,y,{...opts, font:"Helvetica-Bold"}); }
function LBL(str, x, y, opts={}) {
  return T(str.toUpperCase(), x, y, { size:7.5, color:C.amber,
    font:"Helvetica-Bold", gap:0, ...opts });
}

// ── image helper with clipped rounded rect ──────────────────
function addImg(name, x, y, w, h, r=8) {
  const p = imgPath(name);
  if (!p) { roundBox(x,y,w,h,r,C.card2,C.border2); return; }
  save();
  roundFill(x,y,w,h,r,C.card2);
  roundStroke(x,y,w,h,r,C.border2);
  doc.roundedRect(x+1,y+1,w-2,h-2,r-1).clip();
  doc.image(p, x+1, y+1, { fit:[w-2,h-2], align:"center", valign:"center" });
  rest();
}

// ── card helpers ────────────────────────────────────────────
function card(x,y,w,h,r=8,fill=C.card,stroke=C.border) {
  roundBox(x,y,w,h,r,fill,stroke);
}
// card with amber left accent bar
function accentCard(x,y,w,h,r=8,accentColor=C.amber) {
  card(x,y,w,h,r);
  save();
  doc.roundedRect(x,y,4,h,r).fill(accentColor);
  doc.rect(x+4,y,2,h).fill(accentColor+"30");
  rest();
}

// ── stat box ────────────────────────────────────────────────
function statBox(x,y,w,val,lbl,color=C.amber) {
  card(x,y,w,70,8,C.card,C.border2);
  gradV(x,y,w,35,color+"20","#00000000");
  B(val,  x,y+10,  {size:22, color, w, align:"center"});
  T(lbl.toUpperCase(), x,y+40, {size:7, color:C.muted, font:"Helvetica-Bold",
                                  w, align:"center", gap:0});
}

// ── section page setup ──────────────────────────────────────
function newPage(bgColor=C.bg) {
  doc.addPage();
  fillR(0,0,W,H,bgColor);
}

// ── header band ─────────────────────────────────────────────
function pageHeader(sectionNum, title, subtitle) {
  // top gradient bar
  const g = doc.linearGradient(0,0,W,0);
  g.stop(0, C.amber, 1); g.stop(0.5, C.orange, 0.7); g.stop(1, "#00000000", 0);
  save(); doc.rect(0,0,W,3).fill(g); rest();

  // header bg
  fillR(0,3,W,118,C.gold1);
  gradV(0,3,W,118,C.amber+"18","#00000000");

  // section label pill
  roundBox(M, 18, 90, 18, 9, C.gold2, C.gold2);
  T(sectionNum.toUpperCase(), M+10, 22, {size:7.5, color:C.amber, font:"Helvetica-Bold"});

  B(title, M, 42, { size:28, color:C.white });
  // amber underline
  const tw = Math.min(doc.widthOfString(title,{size:28})+4, CW);
  const g2 = doc.linearGradient(M,0,M+tw,0);
  g2.stop(0,C.amber,1); g2.stop(1,"#00000000",0);
  save(); doc.rect(M,72,tw,2).fill(g2); rest();

  if (subtitle) {
    T(subtitle, M, 80, { size:10.5, color:C.muted, w:CW-60, gap:1.5 });
  }

  hline(0,W,121,C.border2);
  return 130;  // content y start
}

// ── footer ──────────────────────────────────────────────────
function footer(pageNum, total=14) {
  hline(0,W,H-32,C.border2);
  fillR(0,H-32,W,32,C.gold1+"40");
  B("Zebvix.", M, H-22, {size:11,color:C.amber});
  T("Platform Brochure 2026 — Confidential", 0, H-22,
    {size:8,color:C.dim,w:W,align:"center"});
  T(`${pageNum} / ${total}`, W-M-30, H-22, {size:8,color:C.dim});
}

// ── progress bar helper ─────────────────────────────────────
function progressBar(x,y,w,h,pct,color=C.amber,bgColor=C.border) {
  roundBox(x,y,w,h,h/2,bgColor,null);
  const filled = Math.max(4, w * pct / 100);
  const g = doc.linearGradient(x,y,x+filled,y);
  g.stop(0,color,1); g.stop(1,color+"cc",1);
  save(); doc.roundedRect(x,y,filled,h,h/2).fill(g); rest();
}

// chip
function chip(label, x, y, color=C.amber, bg=null) {
  const bgl = bg || color+"22";
  const brd = color+"55";
  const tw = doc.widthOfString(label,{size:8})+14;
  roundBox(x,y,tw,16,8,bgl,brd,0.5);
  T(label,x+7,y+4,{size:8,color,font:"Helvetica-Bold"});
  return tw+5;
}

// bullet row
function bullet(icon,title,desc,x,y,w) {
  T(icon, x, y, {size:11});
  B(title, x+22, y, {size:9.5,color:C.white});
  T(desc,  x+22, y+14, {size:8.5,color:C.muted,w:w-22,gap:1});
}

// numbered step
function step(num,title,desc,x,y,w) {
  roundBox(x,y,20,20,10,C.gold2,C.amber+"66",0.5);
  B(`${num}`,x+7,y+5,{size:8,color:C.amber});
  B(title,  x+28,y+3,  {size:9.5,color:C.white});
  T(desc,   x+28,y+16, {size:8.5,color:C.muted,w:w-28,gap:1});
}

// ═══════════════════════════════════════════════════════════════════
// 01 ── COVER PAGE
// ═══════════════════════════════════════════════════════════════════
fillR(0,0,W,H,C.bg);

// Diagonal gold glow top-left
save();
const gCover = doc.radialGradient(0,0,0,150,150,350);
gCover.stop(0,C.amber+"44",1); gCover.stop(1,"#00000000",0);
doc.rect(0,0,W,H).fill(gCover);
rest();

// right glow
save();
const gCover2 = doc.radialGradient(W,H/3,0,W,H/3,280);
gCover2.stop(0,C.orange+"22",1); gCover2.stop(1,"#00000000",0);
doc.rect(0,0,W,H).fill(gCover2);
rest();

// top amber bar with gradient
const barG = doc.linearGradient(0,0,W,0);
barG.stop(0,C.amber,1); barG.stop(0.6,C.orange,0.8); barG.stop(1,"#00000000",0);
save(); doc.rect(0,0,W,4).fill(barG); rest();

// LOGO text
save();
const logoG = doc.linearGradient(M,40,M+300,40);
logoG.stop(0,C.amber,1); logoG.stop(0.5,C.gold3,1); logoG.stop(1,C.orange,1);
doc.font("Helvetica-Bold").fontSize(58).fillColor(logoG).text("Zebvix.", M, 40, {lineBreak:false});
rest();

// Tagline
T("India's Next-Generation Cryptocurrency Exchange", M, 108, {
  size:13, color:C.muted, w:CW
});

// hero image
const heroH = Math.round((W-M*2) * 9/16);
addImg("hero-banner.png", M, 132, CW, heroH, 12);

// Glow border around hero
save();
const heroGlow = doc.linearGradient(M,132,M,132+heroH);
heroGlow.stop(0,C.amber+"33",1); heroGlow.stop(1,"#00000000",0);
doc.roundedRect(M,132,CW,heroH,12).lineWidth(1).stroke(C.amber+"88");
rest();

// Badges — two rows
const BY1 = 132 + heroH + 16;
const badges1 = ["🏛️  FIU-IND Registered","🔐  Bank-Grade Security","⚡  200+ Markets","📊  Spot · Futures · Options"];
let bx = M;
for (const b of badges1) {
  const bw = doc.widthOfString(b,{size:9})+22;
  roundBox(bx,BY1,bw,22,11,C.gold1,C.gold2+"cc",0.5);
  T(b,bx+11,BY1+7,{size:9,color:C.amber});
  bx += bw+6;
}
const BY2 = BY1+28;
const badges2 = ["🇮🇳  Built for India","🤖  AI Trading Plans","💰  Earn up to 18% APY","🎁  30% Referral Commission"];
bx = M;
for (const b of badges2) {
  const bw = doc.widthOfString(b,{size:9})+22;
  roundBox(bx,BY2,bw,22,11,"#0a1205","#1a3a25",0.5);
  T(b,bx+11,BY2+7,{size:9,color:C.green});
  bx += bw+6;
}

// Bottom company bar
fillR(0,H-56,W,56,C.gold1);
hline(0,W,H-56,C.gold2);
const g3 = doc.linearGradient(0,H-56,W,H-56);
g3.stop(0,C.amber+"22",1); g3.stop(1,"#00000000",0);
save(); doc.rect(0,H-56,W,56).fill(g3); rest();

B("Zebvix Technologies Private Limited",       M, H-46, {size:10,color:C.light});
T("CIN: U66190UW2026PTC251591  |  PAN: AACCZ9728R  |  FIU-IND Registered Reporting Entity under PMLA 2002",
  M, H-32, {size:8.5,color:C.muted, w:CW});

// right side of footer
T("Full Platform Brochure",  W-M-120, H-46, {size:9,color:C.amber,align:"right",w:120});
T("June 2026 · Confidential", W-M-120, H-32, {size:8,color:C.dim,align:"right",w:120});


// ═══════════════════════════════════════════════════════════════════
// 02 ── TABLE OF CONTENTS
// ═══════════════════════════════════════════════════════════════════
newPage();
// left accent strip
fillR(0,0,6,H,C.amber);
gradH(6,0,60,H,C.amber+"22","#00000000");
hline(0,W,0,C.amber,4);

B("Table of Contents", M+20, 36, {size:28,color:C.white});
const g4 = doc.linearGradient(M+20,0,M+250,0);
g4.stop(0,C.amber,1); g4.stop(1,"#00000000",0);
save(); doc.rect(M+20,68,220,2).fill(g4); rest();
T("Everything inside this brochure", M+20, 76, {size:10,color:C.muted});

const tocItems = [
  { num:"01", icon:"🏢", title:"Company Introduction",           sub:"Overview, compliance, mission"            },
  { num:"02", icon:"📈", title:"Spot Trading",                   sub:"Orderbook, order types, matching engine"  },
  { num:"03", icon:"⚡", title:"Perpetual Futures",              sub:"Go engine, leverage tiers, funding"       },
  { num:"04", icon:"🎯", title:"Options Trading",                sub:"Black-Scholes, Greeks, collateral model"  },
  { num:"05", icon:"🤝", title:"P2P Marketplace",               sub:"Escrow, dispute resolution, payment rails"},
  { num:"06", icon:"🤖", title:"AI Trading Plans",              sub:"Automated returns, tax compliance"         },
  { num:"07", icon:"👥", title:"Copy Trading & Bots",           sub:"Social trading, Grid & DCA automation"    },
  { num:"08", icon:"💰", title:"Earn / Staking",               sub:"Fixed & flexible yield, 18% APY"           },
  { num:"09", icon:"👛", title:"Multi-Asset Wallet",            sub:"Multi-chain, ledger, security"             },
  { num:"10", icon:"🏦", title:"INR Payments",                  sub:"UPI, IMPS, NEFT, RTGS, Razorpay"          },
  { num:"11", icon:"📊", title:"KoinX Tax Integration",         sub:"Auto-sync, Schedule VDA, ITR filing"       },
  { num:"12", icon:"🛠️", title:"Tools & Growth",              sub:"Convert, Portfolio, Leagues, Referrals"     },
  { num:"13", icon:"💰", title:"Fee Schedule",                  sub:"Spot, Futures, Deposit/Withdrawal fees"    },
  { num:"14", icon:"🛡️", title:"KYC, Security & Compliance",  sub:"KYC tiers, security layers, AML"           },
];

let ty = 100;
const LC  = Math.ceil(tocItems.length/2);
const COL2 = M + 20 + CW/2 + 10;

tocItems.forEach((item, i) => {
  const col = i < LC ? M+20 : COL2;
  const row = i < LC ? i    : i - LC;
  const ry  = ty + row * 42;

  card(col, ry, CW/2 - 14, 36, 8, C.card, C.border);
  // left accent
  roundFill(col,ry,4,36,8,C.amber);

  T(item.icon, col+14, ry+8, {size:13});
  B(item.title,     col+36, ry+5,  {size:9.5,color:C.white});
  T(item.sub,       col+36, ry+18, {size:8,color:C.muted,w:CW/2-60});
  T(item.num,       col+CW/2-30, ry+10, {size:11,color:C.border2,font:"Helvetica-Bold"});
});

footer(2);

// ═══════════════════════════════════════════════════════════════════
// 03 ── INTRODUCTION / COMPANY
// ═══════════════════════════════════════════════════════════════════
newPage();
let y = pageHeader("01 — Introduction", "Company Overview", "Zebvix Technologies — India's most advanced full-stack crypto exchange, engineered for performance, compliance, and scale.");

// key metrics row
const MCW4 = (CW-18)/4;
statBox(M,         y, MCW4, "200+",  "Trading Markets", C.amber);
statBox(M+MCW4+6,  y, MCW4, "12+",   "Product Verticals", C.amber);
statBox(M+(MCW4+6)*2, y, MCW4, "125×", "Max Leverage",  C.orange);
statBox(M+(MCW4+6)*3, y, MCW4, "18%",  "Max APY Earn",  C.green);
y += 80;

// 2-col company + compliance
const HCW = (CW-12)/2;
accentCard(M, y, HCW, 118);
B("🏢  Company Profile", M+16, y+12, {size:11,color:C.amber});
const companyInfo = [
  ["Name",   "Zebvix Technologies Private Limited"],
  ["CIN",    "U66190UW2026PTC251591"],
  ["PAN",    "AACCZ9728R"],
  ["Founded","10 April 2026, India"],
  ["Email",  "support@zebvix.com"],
];
let iy = y+30;
for (const [k,v] of companyInfo) {
  T(k+":", M+16, iy, {size:8.5,color:C.muted});
  B(v,    M+80, iy, {size:8.5,color:C.light});
  iy += 14;
}

accentCard(M+HCW+12, y, HCW, 118, 8, C.green);
B("🏛️  Regulatory & Compliance", M+HCW+24, y+12, {size:11,color:C.green});
const compliance = [
  ["FIU-IND","Registered Reporting Entity — PMLA 2002"],
  ["TDS",    "1% auto-deduction — IT Act Sec 194S"],
  ["KYC",    "PAN · Aadhaar · EDD tiers"],
  ["Sanction","OFAC · UN · EU · MHA screening"],
  ["Reports","STR · CTR · CBWTR to FIU-IND"],
];
iy = y+30;
for (const [k,v] of compliance) {
  B(k+":", M+HCW+24, iy, {size:8.5,color:C.green});
  T(v,     M+HCW+80, iy, {size:8.5,color:C.light});
  iy += 14;
}
y += 130;

// Mission highlight
const g5 = doc.linearGradient(M,y,M+CW,y);
g5.stop(0,C.amber+"33",1); g5.stop(0.5,C.orange+"11",1); g5.stop(1,"#00000000",0);
save(); doc.roundedRect(M,y,CW,72,8).fill(g5); rest();
roundStroke(M,y,CW,72,8,C.gold2,0.5);
save(); doc.rect(M,y,3,72).fill(C.amber); rest();
B("Our Mission", M+18, y+12, {size:13,color:C.amber});
T("To democratize access to global digital asset markets for every Indian — from first-time retail investors to\ninstitutional trading desks — through best-in-class technology, transparent pricing, and full regulatory compliance.",
  M+18, y+32, {size:10.5,color:C.light,w:CW-30,gap:2});
y += 84;

// Tech stack cards
const QW = (CW-18)/4;
const stack = [
  {icon:"⚡", t:"Node.js 24",     d:"Express 5 API\nZod v4 validation"},
  {icon:"🐹", t:"Go 1.22 Engine", d:"Futures matching\nHigh concurrency"},
  {icon:"🗃️", t:"PostgreSQL",    d:"Drizzle ORM\nDouble-entry ledger"},
  {icon:"📡", t:"Redis + WS",    d:"Orderbook ZSET\nPub/Sub real-time"},
];
for (let i=0;i<4;i++) {
  card(M+(QW+6)*i, y, QW, 72, 8, C.card, C.border2);
  T(stack[i].icon, M+(QW+6)*i+(QW-24)/2, y+10, {size:18,align:"center",w:24});
  B(stack[i].t, M+(QW+6)*i, y+36, {size:9,color:C.amber,w:QW,align:"center"});
  T(stack[i].d, M+(QW+6)*i, y+52, {size:8,color:C.muted,w:QW,align:"center",gap:1});
}

footer(3);

// ═══════════════════════════════════════════════════════════════════
// 04 ── SPOT TRADING
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("02 — Spot Trading", "Professional Spot Exchange",
  "Limit, Market and Stop-Limit orders across 200+ pairs with sub-millisecond matching and full TDS compliance.");

// Large feature image
const imgH = Math.round(CW * 9/16);
addImg("spot-trading.png", M, y, CW, imgH, 10);
y += imgH + 14;

// 3 feature cards
const C3 = (CW-16)/3;
const spotFeats = [
  {icon:"📈", t:"Order Types", d:"Limit · Market · Stop-Limit\n±10% slippage protection\nSelf-trade prevention"},
  {icon:"⚡", t:"Matching Engine", d:"Redis ZSET orderbook\nPrice-time FIFO priority\nSub-millisecond fills"},
  {icon:"💹", t:"Market Data", d:"TradingView charts\nLevel-2 depth, trade tape\n24h OHLCV + WebSocket"},
];
for (let i=0;i<3;i++) {
  accentCard(M+(C3+8)*i, y, C3, 96);
  T(spotFeats[i].icon, M+(C3+8)*i+16, y+12, {size:18});
  B(spotFeats[i].t, M+(C3+8)*i+16, y+36, {size:11,color:C.amber});
  T(spotFeats[i].d, M+(C3+8)*i+16, y+54, {size:9,color:C.muted,w:C3-26,gap:2});
}
y += 108;

// Quote pairs row
hline(M,M+CW,y,C.border);
y += 10;
T("AVAILABLE QUOTE PAIRS", M, y, {size:7.5,color:C.amber,font:"Helvetica-Bold"});
y += 14;
let chipX = M;
for (const pair of ["INR","USDT","BTC","ETH","ZBX"]) {
  chipX += chip(pair, chipX, y, C.amber) ;
}
y += 24;
T("200+ base assets including BTC, ETH, BNB, SOL, XRP, ADA, DOGE, MATIC, AVAX, LINK, UNI and many more.",
  M, y, {size:9,color:C.muted,w:CW,gap:1});

footer(4);

// ═══════════════════════════════════════════════════════════════════
// 05 ── FUTURES TRADING
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("03 — Perpetual Futures", "Ultra-Low Latency Futures Engine",
  "High-performance Go-powered perpetual contracts with up to 125× leverage, hourly funding, and real-time risk controls.");

addImg("futures-trading.png", M, y, CW, imgH, 10);
y += imgH + 14;

const futFeats = [
  {icon:"🐹", t:"Go Matching Engine", d:"Dedicated Go 1.22 engine\nPer-pair mutex locking\nStateless DB write-back"},
  {icon:"🛡️", t:"Risk Controls",     d:"Isolated margin mode\nAuto-liquidation engine\n0.30% liquidation fee"},
  {icon:"📡", t:"Real-Time Feeds",   d:"WebSocket depth push\nLive funding countdown\nMark price & PnL feed"},
];
for (let i=0;i<3;i++) {
  accentCard(M+(C3+8)*i, y, C3, 96, 8, C.orange);
  T(futFeats[i].icon, M+(C3+8)*i+16, y+12, {size:18});
  B(futFeats[i].t, M+(C3+8)*i+16, y+36, {size:11,color:C.orange});
  T(futFeats[i].d, M+(C3+8)*i+16, y+54, {size:9,color:C.muted,w:C3-26,gap:2});
}
y += 108;

// Leverage visual
hline(M,M+CW,y,C.border); y+=10;
T("LEVERAGE TIERS & MAX LEVERAGE", M, y, {size:7.5,color:C.orange,font:"Helvetica-Bold"});
y += 14;
const levTiers = [
  {t:"Regular", l:20, pct:16},
  {t:"VIP 1",   l:30, pct:24},
  {t:"VIP 2",   l:50, pct:40},
  {t:"VIP 3",   l:75, pct:60},
  {t:"VIP 4",   l:100,pct:80},
  {t:"VIP 5",   l:125,pct:100},
];
const barW = (CW-60)/6;
for (let i=0;i<levTiers.length;i++) {
  const lx = M + (barW+8)*i;
  card(lx,y,barW,64,6,C.card,C.border2);
  // bar
  const bh = Math.round(44 * levTiers[i].pct/100);
  gradV(lx+6,y+48-bh,barW-12,bh,C.orange,C.amber);
  roundStroke(lx+6,y+4,barW-12,44,3,C.border2);
  B(levTiers[i].l+"×", lx, y+4, {size:8,color:C.orange,w:barW,align:"center"});
  T(levTiers[i].t,     lx, y+50, {size:6.5,color:C.muted,w:barW,align:"center"});
}

footer(5);

// ═══════════════════════════════════════════════════════════════════
// 06 ── OPTIONS + P2P
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("04 & 05 — Options & P2P", "Derivatives & P2P Marketplace",
  "European-style options with full Greeks, plus an escrow-protected peer-to-peer OTC marketplace.");

// Two-column layout — OPTIONS left, P2P right
const colL = M, colR = M + HCW + 14;

// OPTIONS
accentCard(colL, y, HCW, 22, 8, C.blue);
B("🎯  Options Trading", colL+16, y+7, {size:10.5,color:C.blue});
y += 28;
addImg("options-trading.png", colL, y, HCW, Math.round(HCW*9/16), 8);
let opY = y + Math.round(HCW*9/16) + 10;

const greeks = [["Δ Delta","Direction sensitivity"],["Γ Gamma","Delta change rate"],["Θ Theta","Time decay"],["ν Vega","Vol sensitivity"]];
for (const [g,d] of greeks) {
  roundBox(colL, opY, HCW, 22, 4, C.card, C.border2);
  B(g, colL+10, opY+7, {size:9,color:C.blue});
  T(d, colL+60, opY+7, {size:9,color:C.muted,w:HCW-70});
  opY += 24;
}

// Collateral model box
roundBox(colL,opY,HCW,42,6,C.blue+"11",C.blue+"33");
B("Collateral Model:", colL+10,opY+8,{size:9,color:C.blue});
T("Long: pay premium upfront — no margin calls.\nShort Call: lock max(spot,strike)×qty  |  Short Put: lock strike×qty",
  colL+10,opY+22,{size:8,color:C.muted,w:HCW-20,gap:1});

// P2P
let ry2 = y - 28;
accentCard(colR, ry2, HCW, 22, 8, C.green);
B("🤝  P2P Trading", colR+16, ry2+7, {size:10.5,color:C.green});
ry2 += 28;
addImg("p2p-trading.png", colR, ry2, HCW, Math.round(HCW*9/16), 8);
ry2 += Math.round(HCW*9/16) + 10;

const p2pSteps = [
  {n:1, t:"Seller posts ad",      d:"Set price, min/max, payment methods"},
  {n:2, t:"Buyer opens order",    d:"Crypto auto-locked in escrow"},
  {n:3, t:"Buyer sends payment",  d:"Marks trade as paid with proof"},
  {n:4, t:"Seller releases",      d:"Crypto sent to buyer instantly"},
];
for (const s of p2pSteps) {
  roundBox(colR, ry2, 22, 22, 11, C.green+"22", C.green+"55", 0.5);
  B(`${s.n}`, colR+8, ry2+6, {size:8.5,color:C.green});
  B(s.t,  colR+30, ry2+3,  {size:9,color:C.white});
  T(s.d,  colR+30, ry2+15, {size:8,color:C.muted,w:HCW-35,gap:0});
  ry2 += 26;
}

roundBox(colR,ry2,HCW,34,6,C.green+"11",C.green+"33");
B("Safety:",     colR+10,ry2+7,{size:9,color:C.green});
T("KYC L1 required · Dispute resolution ≤24h SLA · Self-trade prevention · Trade chat",
  colR+10,ry2+20,{size:8,color:C.muted,w:HCW-20,gap:1});

footer(6);

// ═══════════════════════════════════════════════════════════════════
// 07 ── AI TRADING
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("06 — AI Trading Plans", "Automated Investment Plans",
  "Professionally managed AI-driven plans — 0.8%–2.5% daily returns with automated TDS compliance and full earnings transparency.");

addImg("ai-trading.png", M, y, CW, imgH, 10);
y += imgH + 14;

// Plan tiers visual
const plans = [
  {name:"Conservative", daily:"0.8–1.2%", apy:"~365%",  risk:"Low",    color:C.green,  min:"50 USDT"},
  {name:"Moderate",     daily:"1.2–1.8%", apy:"~547%",  risk:"Medium", color:C.amber,  min:"100 USDT"},
  {name:"Aggressive",   daily:"1.8–2.5%", apy:"~912%",  risk:"High",   color:C.orange, min:"250 USDT"},
];
const PW = (CW-16)/3;
for (let i=0;i<3;i++) {
  const p = plans[i];
  card(M+(PW+8)*i,y,PW,108,8,C.card,C.border2);
  gradV(M+(PW+8)*i,y,PW,40,p.color+"33","#00000000");
  // Top colored band
  roundFill(M+(PW+8)*i,y,PW,4,8,p.color);

  B(p.name, M+(PW+8)*i,y+14, {size:11,color:p.color,w:PW,align:"center"});
  T("Daily Return",    M+(PW+8)*i,y+32, {size:7.5,color:C.muted,w:PW,align:"center"});
  B(p.daily,           M+(PW+8)*i,y+44, {size:16,color:p.color,w:PW,align:"center"});
  hline(M+(PW+8)*i+10, M+(PW+8)*i+PW-10, y+64, C.border);
  T("Min: "+p.min,     M+(PW+8)*i,y+70, {size:8.5,color:C.muted,w:PW,align:"center"});
  T("Risk: "+p.risk,   M+(PW+8)*i,y+84, {size:8.5,color:p.color,w:PW,align:"center",font:"Helvetica-Bold"});
}
y += 120;

// How it works steps + Tax compliance
const stepW = HCW-4;
accentCard(M, y, stepW, 100);
B("How It Works", M+16, y+10, {size:11,color:C.amber});
const aiSteps=[
  {n:1,t:"Choose a plan",    d:"Select risk, amount, duration"},
  {n:2,t:"Funds locked",     d:"USDT moved to plan balance"},
  {n:3,t:"Daily earnings",   d:"Returns credited (1% TDS applied)"},
  {n:4,t:"Exit at maturity", d:"Principal + returns released"},
];
let asy = y+30;
for (const s of aiSteps) {
  roundBox(M+16,asy,16,16,8,C.gold2,C.amber+"55",0.5);
  B(`${s.n}`,M+22,asy+4,{size:7,color:C.amber});
  B(s.t,M+38,asy+2, {size:9,color:C.white});
  T(s.d,M+38,asy+14,{size:8,color:C.muted,w:stepW-50,gap:0});
  asy += 22;
}

accentCard(M+HCW+14, y, HCW, 100, 8, C.green);
B("📑  Tax Compliance (194S)", M+HCW+26, y+10, {size:11,color:C.green});
const taxLines = [
  "1% TDS auto-deducted at each daily credit",
  "TDS certificate generated per quarter",
  "Downloadable Schedule VDA invoice",
  "Full ROI breakdown for ITR-2 / ITR-3",
  "FIU-IND reporting for large transactions",
];
let tly = y+30;
for (const l of taxLines) {
  T("✅", M+HCW+26,tly,{size:9,color:C.green});
  T(l,   M+HCW+42,tly,{size:9,color:C.light,w:HCW-30,gap:0});
  tly += 14;
}

footer(7);

// ═══════════════════════════════════════════════════════════════════
// 08 ── COPY TRADING + BOTS
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("07 & 08 — Social & Automation", "Copy Trading & Trading Bots",
  "Follow India's top traders automatically — or deploy Grid and DCA bots that trade 24/7 without any input.");

// Copy left, Bots right
accentCard(colL, y, HCW, 20, 8, C.blue);
B("👥  Copy Trading", colL+16,y+6,{size:10,color:C.blue});
y += 26;
addImg("copy-trading.png", colL, y, HCW, Math.round(HCW*9/16), 8);
let cpy = y + Math.round(HCW*9/16) + 8;
const copyFeats = [
  {icon:"📊", t:"Leaderboard",  d:"Ranked by 30d PnL, win rate, AUM, followers"},
  {icon:"⚙️", t:"Copy Ratio", d:"Set 0–5× copy ratio and max risk per trade"},
  {icon:"⭐", t:"Become Leader",d:"KYC L1+, set performance fee (basis points)"},
];
for (const f of copyFeats) {
  T(f.icon,colL+10,cpy,{size:10});
  B(f.t,   colL+30,cpy,  {size:9.5,color:C.white});
  T(f.d,   colL+30,cpy+14,{size:8.5,color:C.muted,w:HCW-35,gap:0});
  cpy+=28;
}

// Stats row under copy
const CS2 = (HCW-8)/2;
statBox(colL,cpy+6,CS2,"0–5×","Copy Ratio",C.blue);
statBox(colL+CS2+8,cpy+6,CS2,"KYC L1+","To be Leader",C.green);

// Bots right
let bty = y-26;
accentCard(colR, bty, HCW, 20, 8, C.orange);
B("⚙️  Trading Bots", colR+16,bty+6,{size:10,color:C.orange});
bty += 26;
addImg("trading-bots.png", colR, bty, HCW, Math.round(HCW*9/16), 8);
bty += Math.round(HCW*9/16) + 8;

card(colR,bty,HCW,52,8,C.card,C.border2);
gradV(colR,bty,HCW,52,C.orange+"22","#00000000");
B("📊  Grid Bot", colR+12,bty+8,{size:10,color:C.orange});
T("Places buy/sell grids in a price range — profits from oscillation.\nConfigure: lower price, upper price, grid levels, total capital.",
  colR+12,bty+24,{size:8.5,color:C.muted,w:HCW-24,gap:1.5});
bty += 58;

card(colR,bty,HCW,52,8,C.card,C.border2);
gradV(colR,bty,HCW,52,C.amber+"22","#00000000");
B("📉  DCA Bot", colR+12,bty+8,{size:10,color:C.amber});
T("Buys a fixed amount at regular intervals regardless of price.\nConfigure: amount per buy, interval (minutes), total capital cap.",
  colR+12,bty+24,{size:8.5,color:C.muted,w:HCW-24,gap:1.5});

footer(8);

// ═══════════════════════════════════════════════════════════════════
// 09 ── EARN + WALLET
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("09 & 10 — Earn & Wallet", "Passive Income & Multi-Chain Wallet",
  "Earn up to 18% APY on 30+ assets, plus a secure multi-chain custodial wallet supporting every major blockchain.");

// Earn left
accentCard(colL,y,HCW,22,8,C.green);
B("💰  Earn / Staking", colL+16,y+7,{size:10,color:C.green});
y += 28;
addImg("earn-staking.png",colL,y,HCW,Math.round(HCW*9/16),8);
let ey = y + Math.round(HCW*9/16)+8;

// APY comparison
const plans2=[
  {name:"Flexible",pct:12,apy:"3–8%"},
  {name:"30d Fixed",pct:55,apy:"8–12%"},
  {name:"90d Fixed",pct:75,apy:"12–15%"},
  {name:"365d Fixed",pct:100,apy:"15–18%"},
];
for (const p of plans2) {
  B(p.name,colL+10,ey,{size:9,color:C.green});
  T(p.apy+" APY",colL+HCW-60,ey,{size:9,color:C.amber,w:58,align:"right"});
  ey+=14;
  progressBar(colL+10,ey,HCW-20,6,p.pct,C.green,C.border);
  ey+=12;
}

// Wallet right
let wy2 = y-28;
accentCard(colR,wy2,HCW,22,8,C.amber);
B("👛  Multi-Asset Wallet",colR+16,wy2+7,{size:10,color:C.amber});
wy2 += 28;
addImg("crypto-wallet.png",colR,wy2,HCW,Math.round(HCW*9/16),8);
wy2 += Math.round(HCW*9/16)+8;

const walletFeats=[
  {icon:"🔐",t:"AES-256-GCM encryption",d:"Keys decrypted in-memory only"},
  {icon:"❄️",t:"98% Cold Storage",      d:"Hot wallet minimized"},
  {icon:"📒",t:"Double-Entry Ledger",   d:"Full audit trail every change"},
  {icon:"⛓️",t:"Multi-Chain",          d:"BTC·ERC-20·BEP-20·TRC-20·SOL·ZBX L1"},
];
for (const f of walletFeats) {
  T(f.icon,colR+10,wy2,{size:10});
  B(f.t,   colR+28,wy2+1, {size:9,color:C.white});
  T(f.d,   colR+28,wy2+13,{size:8,color:C.muted,w:HCW-35,gap:0});
  wy2+=24;
}

footer(9);

// ═══════════════════════════════════════════════════════════════════
// 10 ── INR PAYMENTS + KOINX
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("11 & 12 — INR & Tax", "INR Banking & KoinX Integration",
  "Seamless Indian Rupee rails via UPI/IMPS/NEFT/RTGS and native KoinX integration for automatic crypto tax reporting.");

accentCard(colL,y,HCW,22,8,C.amber);
B("🏦  INR Payments", colL+16,y+7,{size:10,color:C.amber});
y += 28;
addImg("inr-payments.png",colL,y,HCW,Math.round(HCW*9/16),8);
let ipY = y + Math.round(HCW*9/16)+8;

const inrData=[
  {method:"UPI",  dep:"Free (≤₹5K) / 0.5%", wd:"₹15 flat",  min:"₹100"},
  {method:"IMPS", dep:"Free",                 wd:"₹10 flat",  min:"₹100"},
  {method:"NEFT", dep:"Free",                 wd:"Free",      min:"₹500"},
  {method:"RTGS", dep:"Free",                 wd:"Free",      min:"₹5,000"},
];
// mini table
fillR(colL,ipY,HCW,18,C.gold1);
roundStroke(colL,ipY,HCW,18,0,C.gold2,0.5);
const IC=[46,84,60,46]; let icx=colL;
for (const [h,w] of [["METHOD",46],["DEPOSIT",84],["WITHDRAWAL",60],["MIN",46]]) {
  T(h,icx+4,ipY+5,{size:7,color:C.amber,font:"Helvetica-Bold"});
  icx+=w;
}
ipY+=18;
for (const [i,r] of inrData.entries()) {
  fillR(colL,ipY,HCW,16,i%2===0?C.card:C.card2);
  const vals=[r.method,r.dep,r.wd,r.min];
  icx=colL;
  for (const [j,[,w]] of [["",46],["",84],["",60],["",46]].entries()) {
    const col = j===0?C.amber:(vals[j]==="Free"?C.green:C.light);
    T(vals[j],icx+4,ipY+4,{size:8,color:col,w:w-6});
    icx+=w;
  }
  ipY+=16;
}

// KoinX right
let kx = y-28;
accentCard(colR,kx,HCW,22,8,C.blue);
B("📊  KoinX Tax Integration",colR+16,kx+7,{size:10,color:C.blue});
kx+=28;
addImg("koinx-integration.png",colR,kx,HCW,Math.round(HCW*9/16),8);
kx += Math.round(HCW*9/16)+8;

const koinxSteps=[
  {n:1,t:"Create read-only API key",d:"Settings → API Keys → Read permission"},
  {n:2,t:"Connect on KoinX",        d:"Portfolio → Add Exchange → Zebvix"},
  {n:3,t:"Auto-sync starts",        d:"All trades, deposits, withdrawals pulled"},
  {n:4,t:"Generate tax report",     d:"Schedule VDA ready for ITR-2/3 filing"},
];
for (const s of koinxSteps) {
  step(s.n,s.t,s.d,colR+10,kx,HCW-20);
  kx+=28;
}

footer(10);

// ═══════════════════════════════════════════════════════════════════
// 11 ── TOOLS & GROWTH
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("13 — Tools & Growth", "Convert, Portfolio, Leagues & Referrals",
  "Instant asset swaps, professional analytics, competitive trading leagues, and a 30% lifetime referral commission.");

// 4 equal columns
const Q4 = (CW-18)/4;
const tools=[
  {img:"convert-swap.png",       icon:"⚡", t:"Instant Convert",    color:C.amber},
  {img:"portfolio-analytics.png",icon:"📊", t:"Portfolio Analytics",color:C.blue},
  {img:"trading-leagues.png",    icon:"🏆", t:"Trading Leagues",    color:C.orange},
  {img:"referral-program.png",   icon:"🎁", t:"Referral Program",   color:C.green},
];
const toolDescs=[
  "Swap any two assets at real-time rates. Quote locked 10s. Full history.",
  "PnL breakdown, equity curve, Sharpe ratio. Schedule VDA tax report.",
  "Competitive prize pools. Leaderboard by PnL%. Win ZBX & USDT.",
  "Earn 30% of fees paid by referred users — as ZBX. Lifetime, no cap.",
];
for (let i=0;i<4;i++) {
  const tx = M+(Q4+6)*i;
  addImg(tools[i].img, tx, y, Q4, Math.round(Q4*9/16), 8);
  const iy2 = y + Math.round(Q4*9/16)+6;
  roundFill(tx,iy2,Q4,3,0,tools[i].color);
  B(tools[i].t,  tx,iy2+8,  {size:9.5,color:tools[i].color,w:Q4});
  T(toolDescs[i],tx,iy2+22, {size:8,color:C.muted,w:Q4,gap:1.5});
}
y += Math.round(Q4*9/16) + 80;

// Referral highlight — full width
const rfG = doc.linearGradient(M,y,M+CW,y);
rfG.stop(0,C.green+"44",1); rfG.stop(0.5,C.amber+"22",0.6); rfG.stop(1,"#00000000",0);
save(); doc.roundedRect(M,y,CW,80,10).fill(rfG); rest();
roundStroke(M,y,CW,80,10,C.green+"66",0.5);
save(); doc.roundedRect(M,y,4,80,10).fill(C.green); rest();

save();
const refG2 = doc.linearGradient(M+20,y,M+200,y);
refG2.stop(0,C.green,1); refG2.stop(0.5,C.amber,1); refG2.stop(1,C.orange,1);
doc.font("Helvetica-Bold").fontSize(40).fillColor(refG2).text("30%", M+20, y+14, {lineBreak:false});
rest();
B("Lifetime Referral Commission", M+90, y+14, {size:15,color:C.white});
T("Earn 30% of every trading fee paid by users you refer — credited instantly as ZBX.\nNo cap · No expiry · Unique link + QR code · Real-time earnings dashboard",
  M+90, y+36, {size:10,color:C.muted,w:CW-110,gap:2});
y += 92;

// ZBX discount box
roundBox(M,y,CW,48,8,C.gold1,C.gold2);
const zbxG = doc.linearGradient(M,y,M+CW/3,y);
zbxG.stop(0,C.amber+"33",1); zbxG.stop(1,"#00000000",0);
save(); doc.roundedRect(M,y,CW,48,8).fill(zbxG); rest();
save(); doc.roundedRect(M,y,4,48,8).fill(C.amber); rest();
B("🟡  ZBX Token Holder Benefits", M+18,y+8,{size:12,color:C.amber});
T("Hold ZBX in your spot wallet:", M+18,y+28,{size:10,color:C.muted});
let zbx=M+170;
zbx += chip("25% OFF Spot Fees",zbx,y+25,C.amber)+2;
zbx += chip("10% OFF Futures Fees",zbx,y+25,C.amber)+2;
chip("Applied Automatically",zbx,y+25,C.green);

footer(11);

// ═══════════════════════════════════════════════════════════════════
// 12 ── FEE SCHEDULE — SPOT & FUTURES
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("14 — Fee Schedule", "Transparent Pricing",
  "Competitive VIP tiers with maker/taker rebates, ZBX holder discounts, and a generous first-week zero-fee welcome offer.");

// ── SPOT FEES ──────────────────────────────────────────────────────
LBL("SPOT TRADING FEES — MAKER / TAKER", M, y); y+=14;

const TW = CW;
const spotRows=[
  {t:"Regular",v:"< $100K",  zbx:"≥ 0",          mk:"0.10%", tk:"0.10%", mk_p:100,tk_p:100},
  {t:"VIP 1",  v:"≥ $100K",  zbx:"≥ 250",        mk:"0.090%",tk:"0.100%",mk_p:90, tk_p:100},
  {t:"VIP 2",  v:"≥ $500K",  zbx:"≥ 1,000",      mk:"0.080%",tk:"0.090%",mk_p:80, tk_p:90},
  {t:"VIP 3",  v:"≥ $2M",    zbx:"≥ 5,000",      mk:"0.060%",tk:"0.080%",mk_p:60, tk_p:80},
  {t:"VIP 4",  v:"≥ $10M",   zbx:"≥ 25,000",     mk:"0.040%",tk:"0.060%",mk_p:40, tk_p:60},
  {t:"VIP 5",  v:"≥ $50M",   zbx:"≥ 100,000",    mk:"0.020%",tk:"0.040%",mk_p:20, tk_p:40},
  {t:"VIP 6",  v:"≥ $250M",  zbx:"Custom",        mk:"0.000%",tk:"0.030%",mk_p:0,  tk_p:30},
];
const SCOLS=[60,80,90,60,60,100];
const SHEADS=["TIER","30D VOLUME","ZBX BALANCE","MAKER","TAKER","FEE VISUAL"];
// header
fillR(M,y,TW,20,C.gold1);
roundStroke(M,y,TW,20,4,C.gold2,0.5);
let sx=M;
for (let i=0;i<SHEADS.length;i++) {
  T(SHEADS[i],sx+6,y+6,{size:7,color:C.amber,font:"Helvetica-Bold"});
  sx+=SCOLS[i];
}
y+=20;
for (const [ri,r] of spotRows.entries()) {
  const bg=ri%2===0?C.card:C.card2;
  fillR(M,y,TW,18,bg);
  roundStroke(M,y,TW,18,0,C.border,0.3);
  const vals=[r.t,r.v,r.zbx,r.mk,r.tk];
  sx=M;
  for (let i=0;i<5;i++) {
    const col=i===0?C.amber:(i>=3?C.green:C.muted);
    const font=i===0?"Helvetica-Bold":"Helvetica";
    T(vals[i],sx+6,y+5,{size:8.5,color:col,font,w:SCOLS[i]-8});
    sx+=SCOLS[i];
  }
  // Visual mini-bar for maker
  const bx=M+SCOLS[0]+SCOLS[1]+SCOLS[2]+SCOLS[3]+SCOLS[4]+4;
  progressBar(bx,y+4,SCOLS[5]-14,5,r.mk_p,C.green,C.border);
  progressBar(bx,y+10,SCOLS[5]-14,5,r.tk_p,C.amber,C.border);
  y+=18;
}
y+=10;

// ── FUTURES FEES ──────────────────────────────────────────────────
LBL("FUTURES TRADING FEES — MAKER / TAKER / MAX LEVERAGE", M, y); y+=14;
const futRows2=[
  {t:"Regular",v:"< $1M",   mk:"0.020%",tk:"0.050%",lev:"20×", mk_p:100,tk_p:100},
  {t:"VIP 1",  v:"≥ $1M",   mk:"0.016%",tk:"0.045%",lev:"30×", mk_p:80, tk_p:90},
  {t:"VIP 2",  v:"≥ $10M",  mk:"0.014%",tk:"0.040%",lev:"50×", mk_p:70, tk_p:80},
  {t:"VIP 3",  v:"≥ $50M",  mk:"0.012%",tk:"0.035%",lev:"75×", mk_p:60, tk_p:70},
  {t:"VIP 4",  v:"≥ $250M", mk:"0.010%",tk:"0.030%",lev:"100×",mk_p:50, tk_p:60},
  {t:"VIP 5",  v:"≥ $1B",   mk:"0.005%",tk:"0.025%",lev:"125×",mk_p:25, tk_p:50},
];
const FC=[60,80,70,70,52,118];
const FH=["TIER","30D VOL","MAKER","TAKER","MAX LEV","FEE VISUAL"];
fillR(M,y,TW,20,C.gold1);
roundStroke(M,y,TW,20,4,C.gold2,0.5);
sx=M;
for (let i=0;i<FH.length;i++) {
  T(FH[i],sx+6,y+6,{size:7,color:C.orange,font:"Helvetica-Bold"});
  sx+=FC[i];
}
y+=20;
for (const [ri,r] of futRows2.entries()) {
  const bg=ri%2===0?C.card:C.card2;
  fillR(M,y,TW,18,bg);
  roundStroke(M,y,TW,18,0,C.border,0.3);
  const vals=[r.t,r.v,r.mk,r.tk,r.lev];
  sx=M;
  for (let i=0;i<5;i++) {
    const col=i===0?C.orange:(i>=2&&i<=3?C.green:i===4?C.blue:C.muted);
    T(vals[i],sx+6,y+5,{size:8.5,color:col,font:i===0?"Helvetica-Bold":"Helvetica",w:FC[i]-8});
    sx+=FC[i];
  }
  const bx2=M+FC[0]+FC[1]+FC[2]+FC[3]+FC[4]+4;
  progressBar(bx2,y+4,FC[5]-14,5,r.mk_p,C.green,C.border);
  progressBar(bx2,y+10,FC[5]-14,5,r.tk_p,C.orange,C.border);
  y+=18;
}
y+=10;

// 3 benefit boxes
const BW3=(TW-16)/3;
roundBox(M,y,BW3,46,6,C.gold1,C.gold2);
B("💎  ZBX Discount",  M+10,y+8,  {size:9.5,color:C.amber});
T("25% off spot · 10% off futures\nApplied automatically when holding ZBX",M+10,y+24,{size:8.5,color:C.muted,w:BW3-20,gap:1});

roundBox(M+BW3+8,y,BW3,46,6,C.gold1,C.gold2);
B("🎁  First-Week Offer",M+BW3+18,y+8,{size:9.5,color:C.amber});
T("0% maker & taker on first ₹50,000\nvolume in your first 7 days",M+BW3+18,y+24,{size:8.5,color:C.muted,w:BW3-20,gap:1});

roundBox(M+(BW3+8)*2,y,BW3,46,6,"#0a1205","#1a3a25");
B("🔗  Referral Kickback",M+(BW3+8)*2+10,y+8,{size:9.5,color:C.green});
T("30% of fees from referred users\nInstant credit as ZBX · No cap",M+(BW3+8)*2+10,y+24,{size:8.5,color:C.muted,w:BW3-20,gap:1});

footer(12);

// ═══════════════════════════════════════════════════════════════════
// 13 ── DEPOSIT & WITHDRAWAL FEES
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("15 — Funding Fees", "Deposit & Withdrawal Schedule",
  "All crypto deposits are free. Withdrawal fees are pass-through network fees plus a small handling charge.");

const depRows=[
  {a:"INR",  n:"UPI",       d:"Free (≤₹5K) / 0.50% above", w:"₹15 flat",  m:"₹100"},
  {a:"INR",  n:"IMPS",      d:"Free",                        w:"₹10 flat",  m:"₹100"},
  {a:"INR",  n:"NEFT",      d:"Free",                        w:"Free",      m:"₹500"},
  {a:"INR",  n:"RTGS",      d:"Free",                        w:"Free",      m:"₹5,000"},
  {a:"USDT", n:"TRC-20",    d:"Free",                        w:"1 USDT",    m:"10 USDT"},
  {a:"USDT", n:"ERC-20",    d:"Free",                        w:"5 USDT",    m:"20 USDT"},
  {a:"USDT", n:"BEP-20",    d:"Free",                        w:"0.30 USDT", m:"10 USDT"},
  {a:"USDT", n:"Zebvix L1", d:"Free",                        w:"0.10 USDT", m:"1 USDT"},
  {a:"BTC",  n:"Bitcoin",   d:"Free",                        w:"0.0002 BTC",m:"0.001 BTC"},
  {a:"ETH",  n:"ERC-20",    d:"Free",                        w:"0.003 ETH", m:"0.01 ETH"},
  {a:"ETH",  n:"Zebvix L1", d:"Free",                        w:"0.0005 ETH",m:"0.005 ETH"},
  {a:"BNB",  n:"BEP-20",    d:"Free",                        w:"0.0008 BNB",m:"0.01 BNB"},
  {a:"SOL",  n:"Solana",    d:"Free",                        w:"0.01 SOL",  m:"0.05 SOL"},
  {a:"ZBX",  n:"Zebvix L1", d:"Free",                        w:"0.50 ZBX",  m:"5 ZBX"},
];

const DC=[52,70,160,110,90];
const DH=["ASSET","NETWORK","DEPOSIT FEE","WITHDRAWAL FEE","MIN WITHDRAW"];
fillR(M,y,CW,20,C.gold1);
roundStroke(M,y,CW,20,4,C.gold2,0.5);
sx=M;
for (let i=0;i<DH.length;i++) {
  T(DH[i],sx+6,y+6,{size:7,color:C.amber,font:"Helvetica-Bold"});
  sx+=DC[i];
}
y+=20;
for (const [ri,r] of depRows.entries()) {
  const bg=ri%2===0?C.card:C.card2;
  fillR(M,y,CW,17,bg);
  roundStroke(M,y,CW,17,0,C.border,0.25);
  const vals=[r.a,r.n,r.d,r.w,r.m];
  sx=M;
  for (let i=0;i<vals.length;i++) {
    const col=i===0?C.amber:(vals[i]==="Free"?C.green:C.muted);
    const font=(i===0||vals[i]==="Free")?"Helvetica-Bold":"Helvetica";
    T(vals[i],sx+6,y+4,{size:8.5,color:col,font,w:DC[i]-8});
    sx+=DC[i];
  }
  y+=17;
}
y+=14;

// TDS explanation box
const tdsG = doc.linearGradient(M,y,M+CW,y);
tdsG.stop(0,C.amber+"33",1); tdsG.stop(0.5,C.orange+"11",0.5); tdsG.stop(1,"#00000000",0);
save(); doc.roundedRect(M,y,CW,82,10).fill(tdsG); rest();
roundStroke(M,y,CW,82,10,C.gold2,0.5);
save(); doc.roundedRect(M,y,4,82,10).fill(C.amber); rest();

B("🇮🇳  Indian TDS Compliance — IT Act Section 194S", M+18,y+10,{size:12.5,color:C.amber});

const tdsPoints=[
  "1% TDS auto-deducted from seller's proceeds on EVERY spot trade fill",
  "1% TDS auto-deducted from EVERY AI trading daily earnings credit",
  "Deposited with Government of India on your behalf — you receive TDS certificate",
  "Schedule VDA report generated for ITR-2 / ITR-3 filing — fully compliant",
];
let tdsy=y+30;
for (const pt of tdsPoints) {
  T("•", M+18,tdsy,{size:9,color:C.amber});
  T(pt, M+26,tdsy,{size:9,color:C.light,w:CW-44,gap:0});
  tdsy+=14;
}
y+=94;

// Grid of deposit networks
LBL("Supported Networks Summary", M, y); y+=12;
const nets=["Bitcoin","ERC-20 (Ethereum)","BEP-20 (BSC)","TRC-20 (Tron)","Solana","Polygon","Avalanche","Zebvix L1"];
let netX=M;
for (const n of nets) {
  const nw=doc.widthOfString(n,{size:8.5})+18;
  roundBox(netX,y,nw,18,9,C.card,C.border2);
  T(n,netX+9,y+5,{size:8.5,color:C.muted});
  netX+=nw+5;
}

footer(13);

// ═══════════════════════════════════════════════════════════════════
// 14 ── KYC & SECURITY + CONTACT
// ═══════════════════════════════════════════════════════════════════
newPage();
y = pageHeader("16 — KYC & Security", "Compliance & Security Architecture",
  "Multi-layer AML/KYC framework, bank-grade encryption, real-time sanctions screening, and immutable audit trail.");

// KYC left
accentCard(colL,y,HCW,22,8,C.green);
B("🛡️  KYC Tiers", colL+16,y+7,{size:10,color:C.green});
y+=28;
addImg("kyc-verification.png",colL,y,HCW,Math.round(HCW*9/16),8);
let kycy2=y+Math.round(HCW*9/16)+8;

const kycTiers=[
  {l:"Level 0",r:"Email verified",u:"View & browse markets",c:C.muted},
  {l:"Level 1",r:"PAN card",      u:"Spot, P2P, INR deposits",c:C.amber},
  {l:"Level 2",r:"Aadhaar+Selfie",u:"Withdrawals, AI, Futures",c:C.green},
  {l:"Level 3",r:"EDD documents", u:"Institutional limits",   c:C.blue},
];
for (const k of kycTiers) {
  roundBox(colL,kycy2,HCW,30,6,C.card,C.border2);
  roundFill(colL,kycy2,4,30,6,k.c);
  B(k.l,  colL+12,kycy2+3,{size:9,color:k.c});
  T(k.r,  colL+12,kycy2+16,{size:8,color:C.muted,w:90});
  T("→ "+k.u,colL+110,kycy2+10,{size:8.5,color:C.light,w:HCW-118});
  kycy2+=34;
}

// Compliance badges
const cbadges=["FIU-IND Registered","PMLA 2002","TDS 194S","OFAC Screened","RBI Licensed","Schedule VDA"];
let cbx=colL; let cby=kycy2+8;
for (const b of cbadges) {
  const bw=doc.widthOfString(b,{size:8})+14;
  if (cbx+bw>colL+HCW) { cbx=colL; cby+=20; }
  roundBox(cbx,cby,bw,16,8,"#0a1205","#1a3a25",0.5);
  T(b,cbx+7,cby+4,{size:8,color:C.green,font:"Helvetica-Bold"});
  cbx+=bw+4;
}

// Security right
let secy2=y-28;
accentCard(colR,secy2,HCW,22,8,C.orange);
B("🔐  Security Layers",colR+16,secy2+7,{size:10,color:C.orange});
secy2+=28;
addImg("security-architecture.png",colR,secy2,HCW,Math.round(HCW*9/16),8);
secy2+=Math.round(HCW*9/16)+8;

const secLayers=[
  {icon:"🍪",t:"Session Auth",       d:"cx_session cookie — SameSite=Strict, HttpOnly"},
  {icon:"📱",t:"TOTP 2FA",          d:"Google Authenticator — 6-digit TOTP"},
  {icon:"🔑",t:"API Key Auth",       d:"HMAC-SHA256 signed requests"},
  {icon:"🔒",t:"Wallet Encryption",  d:"AES-256-GCM — keys decrypted in-memory only"},
  {icon:"🛡️",t:"CSRF Protection",   d:"Origin/Referer validation on all mutations"},
  {icon:"⚡",t:"Rate Limiting",      d:"Redis-backed — Global 100/15m · Auth 10/15m"},
  {icon:"✅",t:"Input Validation",   d:"Zod v4 on all API routes — schema-enforced"},
  {icon:"📋",t:"Audit Log",         d:"Immutable admin action log — tamper-proof"},
  {icon:"🌍",t:"Sanctions Screen",   d:"OFAC · UN · EU · MHA screening at onboarding"},
  {icon:"🤖",t:"PoW Protection",    d:"Proof-of-work challenge on registration"},
];
for (const s of secLayers) {
  T(s.icon,colR+10,secy2,{size:9});
  B(s.t,   colR+28,secy2+1,{size:9,color:C.orange});
  T(s.d,   colR+28,secy2+13,{size:8,color:C.muted,w:HCW-35,gap:0});
  secy2+=24;
}

footer(14);

// ═══════════════════════════════════════════════════════════════════
// 15 ── FINAL PAGE: GET STARTED
// ═══════════════════════════════════════════════════════════════════
newPage();
fillR(0,0,W,H,C.bg);

// Gold glow
save();
const finalGlow = doc.radialGradient(W/2,H/2,0,W/2,H/2,350);
finalGlow.stop(0,C.amber+"22",1); finalGlow.stop(1,"#00000000",0);
doc.rect(0,0,W,H).fill(finalGlow);
rest();

// Top bar
const tg2 = doc.linearGradient(0,0,W,0);
tg2.stop(0,C.amber,1); tg2.stop(0.6,C.orange,0.7); tg2.stop(1,"#00000000",0);
save(); doc.rect(0,0,W,4).fill(tg2); rest();

// Large centered logo
save();
const bigLogoG = doc.linearGradient(W/2-150,90,W/2+150,90);
bigLogoG.stop(0,C.amber,1); bigLogoG.stop(0.4,C.gold3,1); bigLogoG.stop(1,C.orange,1);
doc.font("Helvetica-Bold").fontSize(64).fillColor(bigLogoG)
  .text("Zebvix.", 0, 56, {width:W, align:"center", lineBreak:false});
rest();

T("India's Next-Generation Cryptocurrency Exchange", 0, 130, {
  size:14, color:C.muted, w:W, align:"center"
});

hline(M+40,W-M-40, 154, C.border2);

// 3 stat boxes
y=166;
const FSW = (CW-16)/3;
statBox(M,         y, FSW, "₹0",    "Account Opening Fee", C.green);
statBox(M+FSW+8,   y, FSW, "5 min", "KYC Approval Time",   C.amber);
statBox(M+(FSW+8)*2,y,FSW, "24/7",  "Customer Support",    C.blue);
y+=82;

// How to start + Contact side by side
card(M, y, HCW, 160, 8, C.card, C.border2);
gradV(M,y,HCW,40,C.amber+"22","#00000000");
save(); doc.roundedRect(M,y,4,160,8).fill(C.amber); rest();
B("🚀  Get Started in 4 Steps", M+18,y+12,{size:12,color:C.amber});
const getStarted=[
  {n:1,t:"Create your account",   d:"Register with email in 30 seconds — free"},
  {n:2,t:"Complete KYC",          d:"PAN + Aadhaar verification in under 5 minutes"},
  {n:3,t:"Deposit funds",         d:"INR via UPI or any crypto asset — instant credit"},
  {n:4,t:"Start trading",         d:"200+ markets, 12+ product verticals, no minimum"},
];
let gsy=y+36;
for (const s of getStarted) {
  roundBox(M+18,gsy,22,22,11,C.gold2,C.amber+"55",0.5);
  B(`${s.n}`,M+26,gsy+6,{size:9,color:C.amber});
  B(s.t,  M+48,gsy+3,  {size:10,color:C.white});
  T(s.d,  M+48,gsy+16, {size:8.5,color:C.muted,w:HCW-60,gap:0});
  gsy+=34;
}

card(M+HCW+14, y, HCW, 160, 8, C.card, C.border2);
gradV(M+HCW+14,y,HCW,40,C.green+"22","#00000000");
save(); doc.roundedRect(M+HCW+14,y,4,160,8).fill(C.green); rest();
B("📞  Contact & Links", M+HCW+28,y+12,{size:12,color:C.green});
const contacts=[
  ["🌐","Website",    "zebvix.com"],
  ["📧","Support",    "support@zebvix.com"],
  ["📧","Compliance", "compliance@zebvix.com"],
  ["📧","Partners",   "partnerships@zebvix.com"],
  ["📱","Telegram",   "@ZebvixOfficial"],
  ["🐦","Twitter",   "@ZebvixExchange"],
];
let cty2=y+36;
for (const [icon,label2,val] of contacts) {
  T(icon, M+HCW+28,cty2,{size:10});
  T(label2+":",M+HCW+46,cty2+1,{size:8.5,color:C.muted,w:60});
  B(val,       M+HCW+108,cty2+1,{size:8.5,color:C.green});
  cty2+=20;
}
B("Zebvix Technologies Private Limited", M+HCW+28,cty2+4,{size:9,color:C.white});
cty2+=16;
T("CIN: U66190UW2026PTC251591  |  PAN: AACCZ9728R", M+HCW+28,cty2,{size:8,color:C.muted,w:HCW-20});
cty2+=12;
T("Incorporated: 10 April 2026, India",M+HCW+28,cty2,{size:8,color:C.muted});
y+=172;

// product chips row
let chipXf = (W - 540)/2;
const finalChips = [
  {l:"Spot Trading",       c:C.amber},
  {l:"Futures 125×",      c:C.orange},
  {l:"Options",            c:C.blue},
  {l:"P2P Marketplace",   c:C.green},
  {l:"AI Plans",           c:C.amber},
  {l:"Copy Trading",       c:C.blue},
  {l:"Grid & DCA Bots",   c:C.orange},
  {l:"Earn 18% APY",      c:C.green},
  {l:"INR Banking",        c:C.amber},
  {l:"KoinX Tax",          c:C.blue},
];
for (const ch of finalChips) {
  const cw2=doc.widthOfString(ch.l,{size:8.5})+16;
  roundBox(chipXf,y,cw2,18,9,ch.c+"22",ch.c+"55",0.5);
  T(ch.l,chipXf+8,y+5,{size:8.5,color:ch.c,font:"Helvetica-Bold"});
  chipXf+=cw2+4;
  if (chipXf+cw2>W-M) { chipXf=(W-540)/2; y+=22; }
}
y+=28;

// disclaimer
hline(M,W-M,y,C.border); y+=10;
T("Disclaimer: Cryptocurrency trading involves significant risk and may not be suitable for all investors. Past performance of AI trading plans and copy trading leaders does not guarantee future results. Virtual Digital Assets (VDAs) are subject to market risk and regulatory change. Zebvix Technologies Private Limited is registered with FIU-IND as a Reporting Entity under PMLA 2002. All fees, rates, and product terms are subject to change with 7 days advance notice. This document is for informational purposes only and does not constitute financial or investment advice. Please read our complete Terms of Service, Risk Disclosure, AML/KYC Policy, and Fee Schedule at zebvix.com before trading.",
  M, y, {size:7, color:C.dim, w:CW, gap:1.2});

// bottom bar
fillR(0,H-46,W,46,C.gold1);
hline(0,W,H-46,C.gold2,0.5);
const bg2 = doc.linearGradient(0,H-46,W,H-46);
bg2.stop(0,C.amber+"33",1); bg2.stop(1,"#00000000",0);
save(); doc.rect(0,H-46,W,46).fill(bg2); rest();

B("Zebvix.", M, H-34,{size:14,color:C.amber});
T("© 2026 Zebvix Technologies Private Limited. All rights reserved. | FIU-IND Registered",
  0, H-34, {size:8.5,color:C.dim,w:W,align:"center"});
B("zebvix.com", W-M-60,H-34,{size:9,color:C.amber});
T("Presentation Brochure 2026", W-M-100, H-22, {size:7.5,color:C.dim,w:100,align:"center"});

// ═════════════
doc.end();
console.log("✅  Premium PDF saved:", OUT);
