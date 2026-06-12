/**
 * Zebvix Platform — PREMIUM Brochure PDF (pdfkit, no emoji)
 * Run: node scripts/generate-brochure.mjs
 */
import PDFDocument from "pdfkit";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, "..");
const ASSETS = resolve(ROOT, "attached_assets/features");
const OUT    = resolve(ROOT, "docs/Zebvix-Platform-Brochure.pdf");
mkdirSync(resolve(ROOT, "docs"), { recursive: true });

const C = {
  bg:     "#080808", bg2:    "#0d0d0d",
  amber:  "#f59e0b", amber2: "#d97706",
  orange: "#f97316", green:  "#10b981",
  blue:   "#3b82f6", white:  "#ffffff",
  light:  "#e5e5e5", muted:  "#9ca3af",
  dim:    "#4b5563", card:   "#101010",
  card2:  "#141414", border: "#1f1f1f",
  bord2:  "#2a2a2a", gold1:  "#1c1000",
  gold2:  "#3d2600", gold3:  "#fde68a",
};

function imgPath(name) {
  const p = resolve(ASSETS, name);
  return existsSync(p) ? p : null;
}

const doc = new PDFDocument({ size:"A4", margin:0,
  info:{ Title:"Zebvix Platform Brochure 2026",
         Author:"Zebvix Technologies Private Limited",
         Subject:"Full Platform Presentation Brochure" }});
doc.pipe(createWriteStream(OUT));

const W  = doc.page.width;
const H  = doc.page.height;
const M  = 36;
const CW = W - M*2;

/* ── primitives ─────────────────────────────────── */
const sv = ()=> doc.save();
const rs = ()=> doc.restore();

function fr(x,y,w,h,c){ sv(); doc.rect(x,y,w,h).fill(c); rs(); }
function rr(x,y,w,h,r,c){ sv(); doc.roundedRect(x,y,w,h,r).fill(c); rs(); }
function rs2(x,y,w,h,r,c,lw=0.5){ sv(); doc.roundedRect(x,y,w,h,r).lineWidth(lw).stroke(c); rs(); }
function box(x,y,w,h,r,fill,stk,lw=0.5){
  if(fill) rr(x,y,w,h,r,fill);
  if(stk)  rs2(x,y,w,h,r,stk,lw);
}
function circle(x,y,r,fill){ sv(); doc.circle(x,y,r).fill(fill); rs(); }
function hl(x1,x2,y,c=C.border,lw=0.5){ sv(); doc.moveTo(x1,y).lineTo(x2,y).lineWidth(lw).stroke(c); rs(); }

function gV(x,y,w,h,c1,a1,c2,a2){
  sv(); const g=doc.linearGradient(x,y,x,y+h);
  g.stop(0,c1,a1); g.stop(1,c2,a2);
  doc.rect(x,y,w,h).fill(g); rs();
}
function gH(x,y,w,h,c1,a1,c2,a2){
  sv(); const g=doc.linearGradient(x,y,x+w,y);
  g.stop(0,c1,a1); g.stop(1,c2,a2);
  doc.rect(x,y,w,h).fill(g); rs();
}
function gR(x,y,cx2,cy2,r2,c1,a1,c2,a2){
  sv(); const g=doc.radialGradient(x,y,0,cx2,cy2,r2);
  g.stop(0,c1,a1); g.stop(1,c2,a2);
  doc.rect(0,0,W,H).fill(g); rs();
}

/* ── text helpers ───────────────────────────────── */
function T(s,x,y,o={}){
  const{sz=10,c=C.light,f="Helvetica",w,al="left",gap=0}=o;
  sv(); doc.font(f).fontSize(sz).fillColor(c);
  const to={lineGap:gap};
  if(w)  to.width=w;
  if(al) to.align=al;
  doc.text(s,x,y,to); rs(); return doc.y;
}
function B(s,x,y,o={}){ return T(s,x,y,{...o,f:"Helvetica-Bold"}); }
function LBL(s,x,y,o={}){
  return T(s.toUpperCase(),x,y,{sz:7.5,c:C.amber,f:"Helvetica-Bold",...o});
}

/* ── image helper ───────────────────────────────── */
function img(name,x,y,w,h,r=8){
  const p=imgPath(name);
  box(x,y,w,h,r,C.card2,C.bord2);
  if(!p) return;
  sv();
  doc.roundedRect(x+1,y+1,w-2,h-2,r-1).clip();
  doc.image(p,x+1,y+1,{fit:[w-2,h-2],align:"center",valign:"center"});
  rs();
}

/* ── coloured dot bullet ─────────────────────────── */
function dot(x,y,c=C.amber){ circle(x+4,y+5,3.5,c); }

/* ── accent card (left colour bar) ──────────────── */
function aCard(x,y,w,h,r=8,ac=C.amber){
  box(x,y,w,h,r,C.card,C.border);
  rr(x,y,4,h,r,ac);
  gH(x+4,y,30,h,ac,0.12,"#000",0);
}

/* ── stat box ──────────────────────────────────── */
function stat(x,y,w,val,lbl,c=C.amber){
  box(x,y,w,70,8,C.card,C.bord2);
  gV(x,y,w,35,c,0.15,"#000",0);
  B(val, x,y+10, {sz:22,c,w,al:"center"});
  T(lbl.toUpperCase(),x,y+40,{sz:7,c:C.muted,f:"Helvetica-Bold",w,al:"center"});
}

/* ── progress bar ──────────────────────────────── */
function pbar(x,y,w,h,pct,c=C.amber){
  box(x,y,w,h,h/2,C.border,null);
  const fw=Math.max(4,w*pct/100);
  sv(); const g=doc.linearGradient(x,y,x+fw,y);
  g.stop(0,c,1); g.stop(1,c,0.8);
  doc.roundedRect(x,y,fw,h,h/2).fill(g); rs();
}

/* ── tag chip ──────────────────────────────────── */
function chip(lbl,x,y,c=C.amber){
  const tw=doc.widthOfString(lbl,{size:8})+14;
  box(x,y,tw,16,8,c+"22",c+"55",0.5);
  T(lbl,x+7,y+4,{sz:8,c,f:"Helvetica-Bold"});
  return tw+5;
}

/* ── section header ────────────────────────────── */
function hdr(secNum,title,sub){
  fr(0,0,W,H,C.bg);
  // top bar gradient
  sv(); const g=doc.linearGradient(0,0,W,0);
  g.stop(0,C.amber,1); g.stop(0.55,C.orange,0.7); g.stop(1,C.amber,0);
  doc.rect(0,0,W,3).fill(g); rs();
  // header bg
  fr(0,3,W,118,C.gold1);
  gV(0,3,W,118,C.amber,0.12,"#000",0);
  // pill label
  box(M,18,96,17,9,C.gold2,C.gold2);
  T(secNum.toUpperCase(),M+10,22,{sz:7.5,c:C.amber,f:"Helvetica-Bold"});
  // title
  B(title,M,42,{sz:28,c:C.white});
  const tw2=Math.min(doc.widthOfString(title,{size:28})+4,CW);
  sv(); const ug=doc.linearGradient(M,0,M+tw2,0);
  ug.stop(0,C.amber,1); ug.stop(1,"#000",0);
  doc.rect(M,72,tw2,2).fill(ug); rs();
  if(sub) T(sub,M,80,{sz:10,c:C.muted,w:CW-60,gap:1.5});
  hl(0,W,121,C.bord2);
  return 130;
}

/* ── footer ────────────────────────────────────── */
function ftr(n,tot=15){
  hl(0,W,H-32,C.bord2);
  fr(0,H-32,W,32,C.gold1);
  gH(0,H-32,W/3,32,C.amber,0.12,"#000",0);
  B("Zebvix.",M,H-22,{sz:11,c:C.amber});
  T("Platform Brochure 2026 -- Confidential",0,H-22,{sz:8,c:C.dim,w:W,al:"center"});
  T(`${n} / ${tot}`,W-M-30,H-22,{sz:8,c:C.dim});
}

/* ── step row ───────────────────────────────────── */
function step(n,title,desc,x,y,w){
  box(x,y,20,20,10,C.gold2,C.amber+"66",0.5);
  B(`${n}`,x+7,y+5,{sz:8,c:C.amber});
  B(title,x+28,y+3,{sz:9.5,c:C.white});
  T(desc, x+28,y+15,{sz:8.5,c:C.muted,w:w-30,gap:0});
}

/* ── bullet row ─────────────────────────────────── */
function bul(title,desc,x,y,w,c=C.amber){
  dot(x,y,c);
  B(title,x+14,y,{sz:9.5,c:C.white});
  T(desc, x+14,y+14,{sz:8.5,c:C.muted,w:w-16,gap:0});
}

const HCW=(CW-12)/2;
const C3=(CW-16)/3;

/* ═══════════════════════════════════════════════
   01 -- COVER
   ═══════════════════════════════════════════════ */
fr(0,0,W,H,C.bg);
gR(0,0,120,140,380,C.amber,0.18,"#000",0);
gR(W,H/3,W,H/3,300,C.orange,0.1,"#000",0);

sv(); const tg=doc.linearGradient(0,0,W,0);
tg.stop(0,C.amber,1); tg.stop(0.55,C.orange,0.75); tg.stop(1,C.amber,0);
doc.rect(0,0,W,4).fill(tg); rs();

// LOGO
sv();
const lg=doc.linearGradient(M,40,M+340,40);
lg.stop(0,C.amber,1); lg.stop(0.5,C.gold3,1); lg.stop(1,C.orange,1);
doc.font("Helvetica-Bold").fontSize(58).fillColor(lg).text("Zebvix.",M,40,{lineBreak:false});
rs();

T("India's Next-Generation Cryptocurrency Exchange",M,110,{sz:13,c:C.muted,w:CW});

// Hero image
const heroH=Math.round((W-M*2)*9/16);
img("hero-banner.png",M,134,CW,heroH,12);
// glow border
sv(); const hg=doc.linearGradient(M,134,M,134+heroH);
hg.stop(0,C.amber,0.5); hg.stop(1,C.amber,0);
doc.roundedRect(M,134,CW,heroH,12).lineWidth(1).stroke(C.amber+"88"); rs();

// Badge rows -- ASCII text only, no emoji
const BY1=134+heroH+16;
const row1=[
  {t:"FIU-IND Registered",  c:C.amber, bg:C.gold1},
  {t:"Bank-Grade Security",  c:C.amber, bg:C.gold1},
  {t:"200+ Markets",         c:C.amber, bg:C.gold1},
  {t:"Spot - Futures - Options", c:C.amber, bg:C.gold1},
];
let bx=M;
for(const b of row1){
  const bw=doc.widthOfString(b.t,{size:9.5})+24;
  box(bx,BY1,bw,22,11,b.bg,C.gold2+"cc",0.5);
  T(b.t,bx+12,BY1+7,{sz:9.5,c:b.c,f:"Helvetica-Bold"});
  bx+=bw+6;
}
const BY2=BY1+28;
const row2=[
  {t:"Built for India",       c:C.green, bg:"#0a1205"},
  {t:"AI Trading Plans",     c:C.green, bg:"#0a1205"},
  {t:"Earn up to 18% APY",  c:C.green, bg:"#0a1205"},
  {t:"30% Referral Commission",c:C.green, bg:"#0a1205"},
];
bx=M;
for(const b of row2){
  const bw=doc.widthOfString(b.t,{size:9.5})+24;
  box(bx,BY2,bw,22,11,b.bg,"#1a3a25",0.5);
  T(b.t,bx+12,BY2+7,{sz:9.5,c:b.c,f:"Helvetica-Bold"});
  bx+=bw+6;
}

// Company bar
fr(0,H-58,W,58,C.gold1);
hl(0,W,H-58,C.gold2);
gH(0,H-58,W,58,C.amber,0.18,"#000",0);
B("Zebvix Technologies Private Limited",M,H-48,{sz:10,c:C.light});
T("CIN: U66190UW2026PTC251591  |  PAN: AACCZ9728R  |  FIU-IND Registered Reporting Entity under PMLA 2002",
  M,H-34,{sz:8.5,c:C.muted,w:CW});
B("Full Platform Brochure",W-M-130,H-48,{sz:9,c:C.amber,w:130,al:"right"});
T("June 2026  |  Confidential",W-M-130,H-34,{sz:8,c:C.dim,w:130,al:"right"});

/* ═══════════════════════════════════════════════
   02 -- TABLE OF CONTENTS
   ═══════════════════════════════════════════════ */
doc.addPage(); fr(0,0,W,H,C.bg);
fr(0,0,6,H,C.amber); gH(6,0,60,H,C.amber,0.2,"#000",0);
sv(); const tg2=doc.linearGradient(0,0,W,0);
tg2.stop(0,C.amber,1); tg2.stop(0.5,C.orange,0.5); tg2.stop(1,"#000",0);
doc.rect(0,0,W,3).fill(tg2); rs();

B("Table of Contents",M+20,36,{sz:30,c:C.white});
sv(); const ug2=doc.linearGradient(M+20,0,M+280,0);
ug2.stop(0,C.amber,1); ug2.stop(1,"#000",0);
doc.rect(M+20,70,260,2).fill(ug2); rs();
T("Zebvix Platform  --  Full Presentation Brochure  --  June 2026",M+20,78,{sz:9.5,c:C.muted});

const toc=[
  {n:"01",t:"Company Introduction",      d:"Overview, compliance, mission & tech stack"},
  {n:"02",t:"Spot Trading",              d:"Orderbook, order types, matching engine"},
  {n:"03",t:"Perpetual Futures",         d:"Go engine, leverage tiers, funding rates"},
  {n:"04",t:"Options Trading",           d:"Black-Scholes, Greeks, collateral model"},
  {n:"05",t:"P2P Marketplace",          d:"Escrow, dispute resolution, payment rails"},
  {n:"06",t:"AI Trading Plans",         d:"Automated returns, daily credits, tax"},
  {n:"07",t:"Copy Trading & Bots",      d:"Social trading, Grid & DCA automation"},
  {n:"08",t:"Earn / Staking",           d:"Fixed & flexible yield, up to 18% APY"},
  {n:"09",t:"Multi-Asset Wallet",       d:"Multi-chain, ledger, key security"},
  {n:"10",t:"INR Payments",            d:"UPI, IMPS, NEFT, RTGS via Razorpay"},
  {n:"11",t:"KoinX Tax Integration",   d:"Auto-sync, Schedule VDA, ITR filing"},
  {n:"12",t:"Tools & Growth",          d:"Convert, Portfolio, Leagues, Referrals"},
  {n:"13",t:"Spot & Futures Fee Schedule",d:"VIP tiers, maker/taker, discounts"},
  {n:"14",t:"Deposit & Withdrawal Fees",d:"Crypto & INR funding fee schedule"},
  {n:"15",t:"KYC, Security & Compliance",d:"KYC tiers, security layers, AML/PMLA"},
];

const LC=Math.ceil(toc.length/2);
const COL2=M+20+CW/2+10;
const ty0=100;

toc.forEach((item,i)=>{
  const col=i<LC?M+20:COL2;
  const row=i<LC?i:i-LC;
  const ry=ty0+row*42;
  box(col,ry,CW/2-14,36,8,C.card,C.border);
  rr(col,ry,4,36,8,C.amber);

  // number circle
  box(col+CW/2-42,ry+8,28,20,10,C.gold2,C.gold2);
  B(item.n,col+CW/2-38,ry+12,{sz:9,c:C.amber});

  B(item.t,col+14,ry+6,{sz:9.5,c:C.white,w:CW/2-66});
  T(item.d,col+14,ry+20,{sz:7.5,c:C.muted,w:CW/2-66});
});

ftr(2);

/* ═══════════════════════════════════════════════
   03 -- INTRODUCTION
   ═══════════════════════════════════════════════ */
doc.addPage();
let y=hdr("01 -- Introduction","Company Overview",
  "Zebvix Technologies -- India's full-stack crypto exchange, engineered for performance, compliance & scale.");

const MCW4=(CW-18)/4;
stat(M,          y,MCW4,"200+", "Trading Markets",  C.amber);
stat(M+MCW4+6,  y,MCW4,"12+",  "Product Verticals",C.amber);
stat(M+(MCW4+6)*2,y,MCW4,"125x","Max Leverage",    C.orange);
stat(M+(MCW4+6)*3,y,MCW4,"18%", "Max APY Earn",    C.green);
y+=80;

aCard(M,y,HCW,112);
B("Company Profile",M+16,y+12,{sz:11,c:C.amber});
const co=[["Name","Zebvix Technologies Private Limited"],
          ["CIN","U66190UW2026PTC251591"],
          ["PAN","AACCZ9728R"],
          ["Founded","10 April 2026, India"],
          ["Email","support@zebvix.com"]];
let iy=y+30;
for(const[k,v] of co){
  T(k+":",M+16,iy,{sz:8.5,c:C.muted,w:64});
  B(v,    M+86,iy, {sz:8.5,c:C.light});
  iy+=14;
}

aCard(M+HCW+12,y,HCW,112,8,C.green);
B("Regulatory & Compliance",M+HCW+24,y+12,{sz:11,c:C.green});
const comp=[["FIU-IND","Registered Reporting Entity -- PMLA 2002"],
            ["TDS","1% auto-deduction -- IT Act Sec 194S"],
            ["KYC","PAN, Aadhaar, EDD tiers"],
            ["Sanctions","OFAC, UN, EU, MHA screening"],
            ["Reports","STR, CTR, CBWTR to FIU-IND"]];
iy=y+30;
for(const[k,v] of comp){
  B(k+":",M+HCW+24,iy,{sz:8.5,c:C.green,w:70});
  T(v,    M+HCW+98,iy,{sz:8.5,c:C.light,w:HCW-105});
  iy+=14;
}
y+=124;

// Mission box
sv(); const mg=doc.linearGradient(M,y,M+CW,y);
mg.stop(0,C.amber,0.2); mg.stop(0.5,C.orange,0.07); mg.stop(1,"#000",0);
doc.roundedRect(M,y,CW,70,8).fill(mg); rs();
rs2(M,y,CW,70,8,C.gold2,0.5);
rr(M,y,4,70,8,C.amber);
B("Our Mission",M+18,y+12,{sz:13,c:C.amber});
T("To democratize access to global digital asset markets for every Indian -- from first-time retail investors\nto institutional trading desks -- through best-in-class technology, transparent pricing, and full regulatory compliance.",
  M+18,y+30,{sz:10,c:C.light,w:CW-30,gap:2});
y+=82;

// Tech stack
const QW=(CW-18)/4;
const stack=[
  {t:"Node.js 24",    d:"Express 5 API\nZod v4 validation"},
  {t:"Go 1.22 Engine",d:"Futures matching\nHigh concurrency"},
  {t:"PostgreSQL",    d:"Drizzle ORM\nDouble-entry ledger"},
  {t:"Redis + WS",   d:"Orderbook ZSET\nPub/Sub real-time"},
];
for(let i=0;i<4;i++){
  box(M+(QW+6)*i,y,QW,74,8,C.card,C.bord2);
  gV(M+(QW+6)*i,y,QW,30,C.amber,0.12,"#000",0);
  // coloured top bar
  rr(M+(QW+6)*i,y,QW,4,8,C.amber);
  B(stack[i].t,M+(QW+6)*i,y+14,{sz:9.5,c:C.amber,w:QW,al:"center"});
  T(stack[i].d,M+(QW+6)*i,y+32,{sz:8.5,c:C.muted,w:QW,al:"center",gap:1.5});
}
ftr(3);

/* ═══════════════════════════════════════════════
   04 -- SPOT TRADING
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("02 -- Spot Trading","Professional Spot Exchange",
  "Limit, Market and Stop-Limit orders across 200+ pairs with sub-millisecond matching and full TDS compliance.");

const imgH=Math.round(CW*9/16);
img("spot-trading.png",M,y,CW,imgH,10); y+=imgH+14;

const sf=[
  {t:"Order Types",    d:"Limit, Market, Stop-Limit\n+/-10% slippage protection\nSelf-trade prevention"},
  {t:"Matching Engine",d:"Redis ZSET orderbook\nPrice-time FIFO priority\nSub-millisecond fills"},
  {t:"Market Data",    d:"TradingView charts\nLevel-2 depth, trade tape\n24h OHLCV + WebSocket"},
];
for(let i=0;i<3;i++){
  aCard(M+(C3+8)*i,y,C3,96);
  // coloured dot indicator
  circle(M+(C3+8)*i+22,y+22,8,C.amber);
  B("0"+[1,2,3][i],M+(C3+8)*i+16,y+18,{sz:8,c:C.bg,f:"Helvetica-Bold"});
  B(sf[i].t,M+(C3+8)*i+16,y+38,{sz:11,c:C.amber});
  T(sf[i].d,M+(C3+8)*i+16,y+54,{sz:8.5,c:C.muted,w:C3-26,gap:2});
}
y+=110;

hl(M,M+CW,y,C.border); y+=10;
LBL("Available Quote Pairs",M,y); y+=14;
let cx2=M;
for(const p of ["INR","USDT","BTC","ETH","BNB","SOL","ZBX"]){
  cx2+=chip(p,cx2,y,C.amber);
}
y+=22;
T("200+ base assets: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, MATIC, AVAX, LINK, UNI and many more.",
  M,y,{sz:9,c:C.muted,w:CW});
ftr(4);

/* ═══════════════════════════════════════════════
   05 -- FUTURES
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("03 -- Perpetual Futures","Ultra-Low Latency Futures Engine",
  "High-performance Go-powered perpetual contracts with up to 125x leverage and hourly funding rates.");

img("futures-trading.png",M,y,CW,imgH,10); y+=imgH+14;

const ff=[
  {t:"Go Matching Engine", d:"Go 1.22 engine\nPer-pair mutex locking\nStateless DB write-back",     c:C.orange},
  {t:"Risk Controls",      d:"Isolated margin mode\nAuto-liquidation engine\n0.30% liquidation fee", c:C.orange},
  {t:"Real-Time Feeds",    d:"WebSocket depth push\nLive funding countdown\nMark price & PnL feed",  c:C.orange},
];
for(let i=0;i<3;i++){
  aCard(M+(C3+8)*i,y,C3,96,8,C.orange);
  circle(M+(C3+8)*i+22,y+22,8,C.orange);
  B("0"+[1,2,3][i],M+(C3+8)*i+16,y+18,{sz:8,c:C.bg,f:"Helvetica-Bold"});
  B(ff[i].t,M+(C3+8)*i+16,y+38,{sz:11,c:C.orange});
  T(ff[i].d,M+(C3+8)*i+16,y+54,{sz:8.5,c:C.muted,w:C3-26,gap:2});
}
y+=110;

hl(M,M+CW,y,C.border); y+=10;
LBL("Leverage Tiers & Max Leverage",M,y,{c:C.orange}); y+=14;
const levs=[{t:"Regular",l:20,p:16},{t:"VIP 1",l:30,p:24},
            {t:"VIP 2",l:50,p:40},{t:"VIP 3",l:75,p:60},
            {t:"VIP 4",l:100,p:80},{t:"VIP 5",l:125,p:100}];
const bw2=(CW-50)/6;
for(let i=0;i<levs.length;i++){
  const lx=M+(bw2+8)*i;
  box(lx,y,bw2,64,6,C.card,C.bord2);
  // bar
  const bh=Math.round(40*levs[i].p/100);
  sv(); const bg3=doc.linearGradient(lx+6,y+48-bh,lx+6,y+48);
  bg3.stop(0,C.orange,1); bg3.stop(1,C.amber,1);
  doc.rect(lx+6,y+48-bh,bw2-12,bh).fill(bg3); rs();
  rs2(lx+6,y+4,bw2-12,44,3,C.bord2,0.5);
  B(levs[i].l+"x",lx,y+5,{sz:9,c:C.orange,w:bw2,al:"center"});
  T(levs[i].t,lx,y+52,{sz:7,c:C.muted,w:bw2,al:"center"});
}
ftr(5);

/* ═══════════════════════════════════════════════
   06 -- OPTIONS + P2P
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("04 & 05 -- Options & P2P","Derivatives & P2P Marketplace",
  "European-style options with full Greeks, plus an escrow-protected peer-to-peer OTC marketplace.");

const colR=M+HCW+14;

// OPTIONS
aCard(M,y,HCW,22,8,C.blue);
B("Options Trading",M+16,y+7,{sz:10.5,c:C.blue});
y+=28;
img("options-trading.png",M,y,HCW,Math.round(HCW*9/16),8);
let opY=y+Math.round(HCW*9/16)+8;

const greeks=[["Delta (D)","Direction sensitivity"],
              ["Gamma (G)","Delta change rate"],
              ["Theta (T)","Time decay"],
              ["Vega  (V)","Volatility sensitivity"]];
for(const[g,d] of greeks){
  box(M,opY,HCW,22,4,C.card,C.bord2);
  circle(M+10,opY+11,4,C.blue);
  B(g,M+22,opY+7,{sz:9,c:C.blue,w:80});
  T(d,M+106,opY+7,{sz:9,c:C.muted,w:HCW-114});
  opY+=24;
}
box(M,opY,HCW,40,6,C.blue+"11",C.blue+"33");
B("Collateral Model:",M+10,opY+8,{sz:9,c:C.blue});
T("Long: pay premium upfront -- no margin calls.\nShort Call: lock max(spot,strike) x qty  |  Short Put: lock strike x qty",
  M+10,opY+22,{sz:8,c:C.muted,w:HCW-20,gap:1});

// P2P
let ry2=y-28;
aCard(colR,ry2,HCW,22,8,C.green);
B("P2P Trading",colR+16,ry2+7,{sz:10.5,c:C.green});
ry2+=28;
img("p2p-trading.png",colR,ry2,HCW,Math.round(HCW*9/16),8);
ry2+=Math.round(HCW*9/16)+8;

const p2s=[{n:1,t:"Seller posts ad",      d:"Set price, min/max, payment methods"},
           {n:2,t:"Buyer opens order",    d:"Crypto auto-locked in escrow"},
           {n:3,t:"Buyer sends payment",  d:"Marks paid with proof"},
           {n:4,t:"Seller releases",      d:"Crypto sent to buyer instantly"}];
for(const s of p2s){
  box(colR,ry2,22,22,11,C.green+"22",C.green+"55",0.5);
  B(`${s.n}`,colR+8,ry2+6,{sz:9,c:C.green});
  B(s.t,colR+30,ry2+3,{sz:9,c:C.white});
  T(s.d,colR+30,ry2+15,{sz:8,c:C.muted,w:HCW-35});
  ry2+=26;
}
box(colR,ry2,HCW,34,6,C.green+"11",C.green+"33");
B("Safety:",colR+10,ry2+7,{sz:9,c:C.green});
T("KYC L1 required  |  Dispute resolution within 24h  |  Self-trade prevention  |  Real-time trade chat",
  colR+10,ry2+20,{sz:8,c:C.muted,w:HCW-20,gap:1});
ftr(6);

/* ═══════════════════════════════════════════════
   07 -- AI TRADING
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("06 -- AI Trading Plans","Automated Investment Plans",
  "AI-driven plans with 0.8%-2.5% daily returns, automated TDS compliance, and full earnings transparency.");

img("ai-trading.png",M,y,CW,imgH,10); y+=imgH+14;

const plans=[
  {name:"Conservative",daily:"0.8 -- 1.2%",risk:"Low",   c:C.green, min:"50 USDT"},
  {name:"Moderate",    daily:"1.2 -- 1.8%",risk:"Medium",c:C.amber, min:"100 USDT"},
  {name:"Aggressive",  daily:"1.8 -- 2.5%",risk:"High",  c:C.orange,min:"250 USDT"},
];
const PW=(CW-16)/3;
for(let i=0;i<3;i++){
  const p=plans[i];
  box(M+(PW+8)*i,y,PW,106,8,C.card,C.bord2);
  // coloured top band
  rr(M+(PW+8)*i,y,PW,4,8,p.c);
  gV(M+(PW+8)*i,y,PW,40,p.c,0.18,"#000",0);
  B(p.name,M+(PW+8)*i,y+14,{sz:11,c:p.c,w:PW,al:"center"});
  T("Daily Return",M+(PW+8)*i,y+32,{sz:7.5,c:C.muted,w:PW,al:"center"});
  B(p.daily,M+(PW+8)*i,y+44,{sz:15,c:p.c,w:PW,al:"center"});
  hl(M+(PW+8)*i+12,M+(PW+8)*i+PW-12,y+64,C.border);
  T("Min: "+p.min,M+(PW+8)*i,y+70,{sz:8.5,c:C.muted,w:PW,al:"center"});
  T("Risk: "+p.risk,M+(PW+8)*i,y+84,{sz:9,c:p.c,w:PW,al:"center",f:"Helvetica-Bold"});
}
y+=120;

aCard(M,y,HCW,100);
B("How It Works",M+16,y+10,{sz:11,c:C.amber});
const aiS=[{n:1,t:"Choose a plan",   d:"Select risk level, amount, duration"},
           {n:2,t:"Funds locked",    d:"USDT moved to plan balance"},
           {n:3,t:"Daily earnings",  d:"Returns credited daily (1% TDS applied)"},
           {n:4,t:"Exit at maturity",d:"Principal + returns released together"}];
let asy=y+30;
for(const s of aiS){ step(s.n,s.t,s.d,M+16,asy,HCW-30); asy+=22; }

aCard(M+HCW+14,y,HCW,100,8,C.green);
B("Tax Compliance (194S)",M+HCW+26,y+10,{sz:11,c:C.green});
const tl=["1% TDS auto-deducted at each daily credit",
          "TDS certificate generated every quarter",
          "Downloadable Schedule VDA invoice",
          "Full ROI breakdown for ITR-2 / ITR-3",
          "FIU-IND reporting for large transactions"];
let tly=y+30;
for(const l of tl){
  dot(M+HCW+26,tly,C.green);
  T(l,M+HCW+42,tly,{sz:9,c:C.light,w:HCW-55});
  tly+=14;
}
ftr(7);

/* ═══════════════════════════════════════════════
   08 -- COPY + BOTS
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("07 & 08 -- Social & Automation","Copy Trading & Trading Bots",
  "Follow India's top traders automatically, or deploy Grid and DCA bots that trade 24/7 on your behalf.");

aCard(M,y,HCW,22,8,C.blue);
B("Copy Trading",M+16,y+7,{sz:10,c:C.blue});
y+=28;
img("copy-trading.png",M,y,HCW,Math.round(HCW*9/16),8);
let cpy=y+Math.round(HCW*9/16)+8;

const cf=[{t:"Leaderboard",  d:"Ranked by 30d PnL, win rate, AUM, followers"},
          {t:"Copy Ratio",  d:"Set 0-5x copy ratio and max risk per trade"},
          {t:"Become Leader",d:"KYC L1+, set your performance fee (basis points)"}];
for(const f of cf){ bul(f.t,f.d,M+10,cpy,HCW-20,C.blue); cpy+=28; }
const CS2=(HCW-8)/2;
stat(M,cpy+6,CS2,"0-5x","Copy Ratio",C.blue);
stat(M+CS2+8,cpy+6,CS2,"KYC L1+","To be Leader",C.green);

let bty=y-28;
aCard(colR,bty,HCW,22,8,C.orange);
B("Trading Bots",colR+16,bty+7,{sz:10,c:C.orange});
bty+=28;
img("trading-bots.png",colR,bty,HCW,Math.round(HCW*9/16),8);
bty+=Math.round(HCW*9/16)+8;

box(colR,bty,HCW,52,8,C.card,C.bord2);
gV(colR,bty,HCW,52,C.orange,0.15,"#000",0);
rr(colR,bty,4,52,8,C.orange);
B("Grid Bot",colR+14,bty+8,{sz:10.5,c:C.orange});
T("Places buy/sell grids in a defined price range. Profits from oscillation.\nConfigure: lower price, upper price, grid count, total capital (USDT).",
  colR+14,bty+26,{sz:8.5,c:C.muted,w:HCW-24,gap:1.5});
bty+=58;

box(colR,bty,HCW,52,8,C.card,C.bord2);
gV(colR,bty,HCW,52,C.amber,0.15,"#000",0);
rr(colR,bty,4,52,8,C.amber);
B("DCA Bot",colR+14,bty+8,{sz:10.5,c:C.amber});
T("Buys a fixed amount at regular intervals regardless of price.\nConfigure: amount per buy, interval (minutes), total capital cap.",
  colR+14,bty+26,{sz:8.5,c:C.muted,w:HCW-24,gap:1.5});
ftr(8);

/* ═══════════════════════════════════════════════
   09 -- EARN + WALLET
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("09 & 10 -- Earn & Wallet","Passive Income & Multi-Chain Wallet",
  "Earn up to 18% APY on 30+ assets. Secure multi-chain custodial wallet supporting every major blockchain.");

aCard(M,y,HCW,22,8,C.green);
B("Earn / Staking",M+16,y+7,{sz:10,c:C.green});
y+=28;
img("earn-staking.png",M,y,HCW,Math.round(HCW*9/16),8);
let ey=y+Math.round(HCW*9/16)+8;
LBL("APY Range by Duration",M,ey); ey+=14;
const ep=[{name:"Flexible",apy:"3 - 8% APY",p:45},
          {name:"30d Fixed",apy:"8 - 12% APY",p:65},
          {name:"90d Fixed",apy:"12 - 15% APY",p:82},
          {name:"365d Fixed",apy:"15 - 18% APY",p:100}];
for(const pl of ep){
  B(pl.name,M+10,ey,{sz:9,c:C.green,w:80});
  T(pl.apy,M+96,ey,{sz:9,c:C.amber,w:78,al:"right"});
  ey+=14;
  pbar(M+10,ey,HCW-20,7,pl.p,C.green); ey+=13;
}

let wy2=y-28;
aCard(colR,wy2,HCW,22,8,C.amber);
B("Multi-Asset Wallet",colR+16,wy2+7,{sz:10,c:C.amber});
wy2+=28;
img("crypto-wallet.png",colR,wy2,HCW,Math.round(HCW*9/16),8);
wy2+=Math.round(HCW*9/16)+8;
const wf=[{t:"AES-256-GCM encryption",d:"Keys decrypted in-memory only at broadcast"},
          {t:"98% Cold Storage",      d:"Hot wallet minimized, assets secured offline"},
          {t:"Double-Entry Ledger",   d:"Full audit trail for every balance change"},
          {t:"Multi-Chain Support",   d:"BTC, ERC-20, BEP-20, TRC-20, Solana, ZBX L1"}];
for(const f of wf){ bul(f.t,f.d,colR+10,wy2,HCW-20,C.amber); wy2+=28; }
ftr(9);

/* ═══════════════════════════════════════════════
   10 -- INR + KOINX
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("11 & 12 -- INR & Tax","INR Payments & KoinX Integration",
  "Seamless Indian Rupee banking via UPI/IMPS/NEFT/RTGS and KoinX integration for automatic crypto tax reporting.");

aCard(M,y,HCW,22,8,C.amber);
B("INR Payments",M+16,y+7,{sz:10,c:C.amber});
y+=28;
img("inr-payments.png",M,y,HCW,Math.round(HCW*9/16),8);
let ipY=y+Math.round(HCW*9/16)+8;
LBL("INR Rails -- Deposit & Withdrawal",M,ipY); ipY+=14;
const inr=[{m:"UPI", dep:"Free (<=Rs.5K) / 0.5%",wd:"Rs.15 flat",mn:"Rs.100"},
           {m:"IMPS",dep:"Free",                   wd:"Rs.10 flat",mn:"Rs.100"},
           {m:"NEFT",dep:"Free",                   wd:"Free",      mn:"Rs.500"},
           {m:"RTGS",dep:"Free",                   wd:"Free",      mn:"Rs.5,000"}];
const IC=[46,106,76,56];
fr(M,ipY,HCW,18,C.gold1); rs2(M,ipY,HCW,18,0,C.gold2,0.5);
for(const[i,[h,w]] of [["METHOD",46],["DEPOSIT FEE",106],["WITHDRAWAL",76],["MIN",56]].entries()){
  T(h,M+IC.slice(0,i).reduce((a,b)=>a+b,0)+6,ipY+5,{sz:7,c:C.amber,f:"Helvetica-Bold"});
}
ipY+=18;
for(const[ri,r] of inr.entries()){
  fr(M,ipY,HCW,16,ri%2===0?C.card:C.card2);
  const vals=[r.m,r.dep,r.wd,r.mn];
  let icx=M;
  for(const[j,w] of IC.entries()){
    const c=j===0?C.amber:(vals[j]==="Free"?C.green:C.light);
    T(vals[j],icx+6,ipY+4,{sz:8.5,c,w:w-8,f:j===0||vals[j]==="Free"?"Helvetica-Bold":"Helvetica"});
    icx+=w;
  }
  ipY+=16;
}

let kx=y-28;
aCard(colR,kx,HCW,22,8,C.blue);
B("KoinX Tax Integration",colR+16,kx+7,{sz:10,c:C.blue});
kx+=28;
img("koinx-integration.png",colR,kx,HCW,Math.round(HCW*9/16),8);
kx+=Math.round(HCW*9/16)+8;
const ks=[{n:1,t:"Create read-only API key", d:"Settings > API Keys > Read permission only"},
          {n:2,t:"Connect on KoinX",         d:"Portfolio > Add Exchange > Zebvix"},
          {n:3,t:"Auto-sync starts",          d:"All trades, deposits, withdrawals pulled"},
          {n:4,t:"Generate tax report",        d:"Schedule VDA ready for ITR-2/3 filing"}];
for(const s of ks){ step(s.n,s.t,s.d,colR+10,kx,HCW-20); kx+=28; }
ftr(10);

/* ═══════════════════════════════════════════════
   11 -- TOOLS & GROWTH
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("13 -- Tools & Growth","Convert, Portfolio, Leagues & Referrals",
  "Instant swaps, professional analytics, competitive leagues, and a 30% lifetime referral commission program.");

const Q4=(CW-18)/4;
const tools=[
  {img:"convert-swap.png",      t:"Instant Convert",    c:C.amber,  d:"Swap any two assets at real-time\nrates. Quote locked 10s. Full history."},
  {img:"portfolio-analytics.png",t:"Portfolio Analytics",c:C.blue,  d:"PnL breakdown, equity curve, Sharpe\nratio. Schedule VDA tax report."},
  {img:"trading-leagues.png",   t:"Trading Leagues",    c:C.orange, d:"Competitive prize pools. Ranked by\nPnL%. Win ZBX and USDT rewards."},
  {img:"referral-program.png",  t:"Referral Program",   c:C.green,  d:"30% of fees paid by referred users.\nLifetime, no cap. Link + QR code."},
];
for(let i=0;i<4;i++){
  const tx=M+(Q4+6)*i;
  img(tools[i].img,tx,y,Q4,Math.round(Q4*9/16),8);
  const iy3=y+Math.round(Q4*9/16)+4;
  rr(tx,iy3,Q4,3,0,tools[i].c);
  B(tools[i].t,tx,iy3+8,{sz:9.5,c:tools[i].c,w:Q4});
  T(tools[i].d,tx,iy3+22,{sz:8,c:C.muted,w:Q4,gap:1.5});
}
y+=Math.round(Q4*9/16)+68;

// Referral highlight
sv(); const rfG=doc.linearGradient(M,y,M+CW,y);
rfG.stop(0,C.green,0.25); rfG.stop(0.5,C.amber,0.1); rfG.stop(1,"#000",0);
doc.roundedRect(M,y,CW,78,10).fill(rfG); rs();
rs2(M,y,CW,78,10,C.green+"66",0.5);
rr(M,y,4,78,10,C.green);

sv();
const refG2=doc.linearGradient(M+20,y,M+200,y);
refG2.stop(0,C.green,1); refG2.stop(0.5,C.amber,1); refG2.stop(1,C.orange,1);
doc.font("Helvetica-Bold").fontSize(42).fillColor(refG2)
   .text("30%",M+20,y+14,{lineBreak:false}); rs();
B("Lifetime Referral Commission",M+96,y+14,{sz:16,c:C.white});
T("Earn 30% of every trading fee paid by users you refer -- credited instantly as ZBX.\nNo cap  |  No expiry  |  Unique referral link + QR code  |  Real-time earnings dashboard",
  M+96,y+36,{sz:9.5,c:C.muted,w:CW-116,gap:2});
y+=90;

// ZBX discount
box(M,y,CW,46,8,C.gold1,C.gold2);
gH(M,y,CW/3,46,C.amber,0.2,"#000",0);
rr(M,y,4,46,8,C.amber);
B("ZBX Token Holder Benefits",M+18,y+8,{sz:12,c:C.amber});
T("Hold ZBX in your spot wallet:",M+18,y+26,{sz:10,c:C.muted});
let zbx=M+200;
zbx+=chip("25% OFF Spot Fees",zbx,y+23,C.amber);
zbx+=chip("10% OFF Futures Fees",zbx,y+23,C.amber);
chip("Applied Automatically",zbx,y+23,C.green);
ftr(11);

/* ═══════════════════════════════════════════════
   12 -- SPOT & FUTURES FEES
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("14 -- Fee Schedule","Transparent Pricing",
  "Competitive VIP tiers with maker/taker rebates, ZBX discounts, and a first-week zero-fee welcome offer.");

const TW=CW;

// SPOT
LBL("Spot Trading Fees -- Maker / Taker by VIP Tier",M,y); y+=14;
const sp=[
  {t:"Regular",v:"< $100K",  z:"0 ZBX",     mk:"0.10%", tk:"0.10%", mp:100,tp:100},
  {t:"VIP 1",  v:">= $100K", z:"250 ZBX",   mk:"0.090%",tk:"0.100%",mp:90, tp:100},
  {t:"VIP 2",  v:">= $500K", z:"1,000 ZBX", mk:"0.080%",tk:"0.090%",mp:80, tp:90},
  {t:"VIP 3",  v:">= $2M",   z:"5,000 ZBX", mk:"0.060%",tk:"0.080%",mp:60, tp:80},
  {t:"VIP 4",  v:">= $10M",  z:"25,000 ZBX",mk:"0.040%",tk:"0.060%",mp:40, tp:60},
  {t:"VIP 5",  v:">= $50M",  z:"100K ZBX",  mk:"0.020%",tk:"0.040%",mp:20, tp:40},
  {t:"VIP 6",  v:">= $250M", z:"Custom",    mk:"0.000%",tk:"0.030%",mp:0,  tp:30},
];
const SC=[58,78,88,60,60,86]; const SH=["TIER","30D VOLUME","ZBX BALANCE","MAKER","TAKER","VISUAL"];
fr(M,y,TW,19,C.gold1); rs2(M,y,TW,19,4,C.gold2,0.5);
let sx=M; for(let i=0;i<SH.length;i++){ T(SH[i],sx+6,y+6,{sz:7,c:C.amber,f:"Helvetica-Bold"}); sx+=SC[i]; }
y+=19;
for(const[ri,r] of sp.entries()){
  fr(M,y,TW,17,ri%2===0?C.card:C.card2); rs2(M,y,TW,17,0,C.border,0.25);
  const vals=[r.t,r.v,r.z,r.mk,r.tk];
  sx=M; for(let i=0;i<5;i++){
    const c2=i===0?C.amber:(i>=3?C.green:C.muted);
    T(vals[i],sx+6,y+4,{sz:8.5,c:c2,f:i===0?"Helvetica-Bold":"Helvetica",w:SC[i]-8});
    sx+=SC[i];
  }
  const vx=M+SC[0]+SC[1]+SC[2]+SC[3]+SC[4]+4;
  pbar(vx,y+3,SC[5]-12,5,r.mp,C.green);
  pbar(vx,y+9,SC[5]-12,5,r.tp,C.amber);
  y+=17;
}
y+=10;

// FUTURES
LBL("Futures Trading Fees -- Maker / Taker / Max Leverage",M,y); y+=14;
const fu=[
  {t:"Regular",v:"< $1M",   mk:"0.020%",tk:"0.050%",l:"20x", mp:100,tp:100},
  {t:"VIP 1",  v:">= $1M",  mk:"0.016%",tk:"0.045%",l:"30x", mp:80, tp:90},
  {t:"VIP 2",  v:">= $10M", mk:"0.014%",tk:"0.040%",l:"50x", mp:70, tp:80},
  {t:"VIP 3",  v:">= $50M", mk:"0.012%",tk:"0.035%",l:"75x", mp:60, tp:70},
  {t:"VIP 4",  v:">= $250M",mk:"0.010%",tk:"0.030%",l:"100x",mp:50, tp:60},
  {t:"VIP 5",  v:">= $1B",  mk:"0.005%",tk:"0.025%",l:"125x",mp:25, tp:50},
];
const FC=[58,78,68,68,52,106]; const FH=["TIER","30D VOLUME","MAKER","TAKER","MAX LEV","VISUAL"];
fr(M,y,TW,19,C.gold1); rs2(M,y,TW,19,4,C.gold2,0.5);
sx=M; for(let i=0;i<FH.length;i++){ T(FH[i],sx+6,y+6,{sz:7,c:C.orange,f:"Helvetica-Bold"}); sx+=FC[i]; }
y+=19;
for(const[ri,r] of fu.entries()){
  fr(M,y,TW,17,ri%2===0?C.card:C.card2); rs2(M,y,TW,17,0,C.border,0.25);
  const vals=[r.t,r.v,r.mk,r.tk,r.l];
  sx=M; for(let i=0;i<5;i++){
    const c2=i===0?C.orange:(i>=2&&i<=3?C.green:i===4?C.blue:C.muted);
    T(vals[i],sx+6,y+4,{sz:8.5,c:c2,f:i===0?"Helvetica-Bold":"Helvetica",w:FC[i]-8});
    sx+=FC[i];
  }
  const vx=M+FC[0]+FC[1]+FC[2]+FC[3]+FC[4]+4;
  pbar(vx,y+3,FC[5]-12,5,r.mp,C.green);
  pbar(vx,y+9,FC[5]-12,5,r.tp,C.orange);
  y+=17;
}
y+=10;

const BW3=(TW-16)/3;
box(M,y,BW3,46,6,C.gold1,C.gold2);
B("ZBX Discount",M+10,y+8,{sz:9.5,c:C.amber});
T("25% off spot  |  10% off futures\nApplied when holding ZBX in spot wallet",M+10,y+24,{sz:8.5,c:C.muted,w:BW3-20,gap:1});

box(M+BW3+8,y,BW3,46,6,C.gold1,C.gold2);
B("First-Week Offer",M+BW3+18,y+8,{sz:9.5,c:C.amber});
T("0% maker & taker on first Rs.50,000\nvolume in your first 7 days",M+BW3+18,y+24,{sz:8.5,c:C.muted,w:BW3-20,gap:1});

box(M+(BW3+8)*2,y,BW3,46,6,"#0a1205","#1a3a25");
B("Referral Kickback",M+(BW3+8)*2+10,y+8,{sz:9.5,c:C.green});
T("30% of fees from referred users\nInstant credit as ZBX  |  No cap",M+(BW3+8)*2+10,y+24,{sz:8.5,c:C.muted,w:BW3-20,gap:1});
ftr(12);

/* ═══════════════════════════════════════════════
   13 -- DEPOSIT & WITHDRAWAL FEES
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("15 -- Funding Fees","Deposit & Withdrawal Schedule",
  "All crypto deposits are free. Withdrawal fees are pass-through network fees plus a small handling charge.");

const depRows=[
  {a:"INR",  n:"UPI",       d:"Free (<=Rs.5K) / 0.50% above",w:"Rs.15 flat",  m:"Rs.100"},
  {a:"INR",  n:"IMPS",      d:"Free",                          w:"Rs.10 flat",  m:"Rs.100"},
  {a:"INR",  n:"NEFT",      d:"Free",                          w:"Free",        m:"Rs.500"},
  {a:"INR",  n:"RTGS",      d:"Free",                          w:"Free",        m:"Rs.5,000"},
  {a:"USDT", n:"TRC-20",    d:"Free",                          w:"1 USDT",      m:"10 USDT"},
  {a:"USDT", n:"ERC-20",    d:"Free",                          w:"5 USDT",      m:"20 USDT"},
  {a:"USDT", n:"BEP-20",    d:"Free",                          w:"0.30 USDT",   m:"10 USDT"},
  {a:"USDT", n:"Zebvix L1", d:"Free",                          w:"0.10 USDT",   m:"1 USDT"},
  {a:"BTC",  n:"Bitcoin",   d:"Free",                          w:"0.0002 BTC",  m:"0.001 BTC"},
  {a:"ETH",  n:"ERC-20",    d:"Free",                          w:"0.003 ETH",   m:"0.01 ETH"},
  {a:"ETH",  n:"Zebvix L1", d:"Free",                          w:"0.0005 ETH",  m:"0.005 ETH"},
  {a:"BNB",  n:"BEP-20",    d:"Free",                          w:"0.0008 BNB",  m:"0.01 BNB"},
  {a:"SOL",  n:"Solana",    d:"Free",                          w:"0.01 SOL",    m:"0.05 SOL"},
  {a:"ZBX",  n:"Zebvix L1", d:"Free",                          w:"0.50 ZBX",    m:"5 ZBX"},
];
const DC=[52,72,164,110,90]; const DH=["ASSET","NETWORK","DEPOSIT FEE","WITHDRAWAL FEE","MIN WITHDRAW"];
fr(M,y,CW,19,C.gold1); rs2(M,y,CW,19,4,C.gold2,0.5);
sx=M; for(let i=0;i<DH.length;i++){ T(DH[i],sx+6,y+6,{sz:7,c:C.amber,f:"Helvetica-Bold"}); sx+=DC[i]; }
y+=19;
for(const[ri,r] of depRows.entries()){
  fr(M,y,CW,17,ri%2===0?C.card:C.card2); rs2(M,y,CW,17,0,C.border,0.25);
  const vals=[r.a,r.n,r.d,r.w,r.m];
  sx=M; for(let i=0;i<vals.length;i++){
    const c2=i===0?C.amber:(vals[i]==="Free"?C.green:C.muted);
    T(vals[i],sx+6,y+4,{sz:8.5,c:c2,f:i===0||vals[i]==="Free"?"Helvetica-Bold":"Helvetica",w:DC[i]-8});
    sx+=DC[i];
  }
  y+=17;
}
y+=14;

// TDS box
sv(); const tdG=doc.linearGradient(M,y,M+CW,y);
tdG.stop(0,C.amber,0.2); tdG.stop(0.5,C.orange,0.07); tdG.stop(1,"#000",0);
doc.roundedRect(M,y,CW,82,10).fill(tdG); rs();
rs2(M,y,CW,82,10,C.gold2,0.5);
rr(M,y,4,82,10,C.amber);
B("Indian TDS Compliance -- IT Act Section 194S",M+18,y+10,{sz:12.5,c:C.amber});
const tdp=["1% TDS auto-deducted from seller proceeds on every spot trade fill",
           "1% TDS auto-deducted from every AI trading daily earnings credit",
           "Deposited with Government of India on your behalf -- you receive TDS certificate",
           "Schedule VDA report generated for ITR-2 / ITR-3 filing -- fully compliant"];
let tdy=y+30;
for(const p of tdp){ dot(M+18,tdy,C.amber); T(p,M+32,tdy,{sz:9,c:C.light,w:CW-44}); tdy+=14; }
y+=94;

// Network chips
LBL("Supported Networks",M,y); y+=12;
let nx=M;
for(const n of ["Bitcoin","ERC-20 (Ethereum)","BEP-20 (BSC)","TRC-20 (Tron)","Solana","Polygon","Avalanche","Zebvix L1"]){
  const nw=doc.widthOfString(n,{size:8.5})+16;
  box(nx,y,nw,18,9,C.card,C.bord2);
  T(n,nx+8,y+5,{sz:8.5,c:C.muted});
  nx+=nw+5;
}
ftr(13);

/* ═══════════════════════════════════════════════
   14 -- KYC & SECURITY
   ═══════════════════════════════════════════════ */
doc.addPage();
y=hdr("16 -- KYC & Security","Compliance & Security Architecture",
  "Multi-layer AML/KYC framework, bank-grade encryption, real-time sanctions screening, and immutable audit trail.");

aCard(M,y,HCW,22,8,C.green);
B("KYC Verification Tiers",M+16,y+7,{sz:10,c:C.green});
y+=28;
img("kyc-verification.png",M,y,HCW,Math.round(HCW*9/16),8);
let kycy=y+Math.round(HCW*9/16)+8;

const kycTiers=[
  {l:"Level 0",r:"Email verified",       u:"View & browse markets",   c:C.muted},
  {l:"Level 1",r:"PAN card",             u:"Spot, P2P, INR deposits", c:C.amber},
  {l:"Level 2",r:"Aadhaar + Selfie",     u:"Withdrawals, AI, Futures",c:C.green},
  {l:"Level 3",r:"EDD documents",        u:"Institutional limits",    c:C.blue},
];
for(const k of kycTiers){
  box(M,kycy,HCW,28,6,C.card,C.bord2);
  rr(M,kycy,4,28,6,k.c);
  B(k.l,M+12,kycy+4,{sz:8.5,c:k.c,w:56});
  T(k.r,M+72,kycy+4,{sz:8.5,c:C.muted,w:96});
  T(">> "+k.u,M+172,kycy+4,{sz:8.5,c:C.light,w:HCW-180});
  T("Requirement: "+k.r,M+12,kycy+16,{sz:7.5,c:C.dim,w:HCW-20});
  kycy+=30;
}

// Compliance badges
const cbs=["FIU-IND Registered","PMLA 2002","TDS 194S","OFAC Screened","RBI Licensed","Schedule VDA"];
let cbx=M; let cby=kycy+8;
for(const b of cbs){
  const bw=doc.widthOfString(b,{size:8})+14;
  if(cbx+bw>M+HCW){ cbx=M; cby+=20; }
  box(cbx,cby,bw,16,8,"#0a1205","#1a3a25",0.5);
  T(b,cbx+7,cby+4,{sz:8,c:C.green,f:"Helvetica-Bold"});
  cbx+=bw+4;
}

// Security right
let secy2=y-28;
aCard(colR,secy2,HCW,22,8,C.orange);
B("Security Architecture",colR+16,secy2+7,{sz:10,c:C.orange});
secy2+=28;
img("security-architecture.png",colR,secy2,HCW,Math.round(HCW*9/16),8);
secy2+=Math.round(HCW*9/16)+8;

const secL=[
  ["Session Auth",      "cx_session cookie -- SameSite=Strict, HttpOnly"],
  ["TOTP 2FA",         "Google Authenticator -- 6-digit TOTP"],
  ["API Key Auth",      "HMAC-SHA256 signed requests"],
  ["Wallet Encryption", "AES-256-GCM -- keys decrypted in-memory only"],
  ["CSRF Protection",   "Origin/Referer validation on all mutations"],
  ["Rate Limiting",     "Redis-backed -- 100/15m global, 10/15m auth"],
  ["Input Validation",  "Zod v4 on all API routes -- schema-enforced"],
  ["Audit Log",        "Immutable admin action log -- tamper-proof"],
  ["Sanctions Screen",  "OFAC, UN, EU, MHA screening at onboarding"],
  ["PoW Protection",   "Proof-of-work challenge on registration"],
];
for(const[t,d] of secL){
  dot(colR+10,secy2,C.orange);
  B(t,   colR+22,secy2,  {sz:9,c:C.orange,w:90});
  T(d,   colR+116,secy2, {sz:8.5,c:C.muted,w:HCW-120});
  secy2+=22;
}
ftr(14);

/* ═══════════════════════════════════════════════
   15 -- GET STARTED
   ═══════════════════════════════════════════════ */
doc.addPage(); fr(0,0,W,H,C.bg);
gR(0,0,W/2,H/2,400,C.amber,0.15,"#000",0);
sv(); const tg3=doc.linearGradient(0,0,W,0);
tg3.stop(0,C.amber,1); tg3.stop(0.55,C.orange,0.7); tg3.stop(1,C.amber,0);
doc.rect(0,0,W,4).fill(tg3); rs();

// Large logo
sv();
const blg=doc.linearGradient(W/2-180,56,W/2+180,56);
blg.stop(0,C.amber,1); blg.stop(0.45,C.gold3,1); blg.stop(1,C.orange,1);
doc.font("Helvetica-Bold").fontSize(62).fillColor(blg)
   .text("Zebvix.",0,56,{width:W,align:"center",lineBreak:false}); rs();

T("India's Next-Generation Cryptocurrency Exchange",0,130,{sz:14,c:C.muted,w:W,al:"center"});
hl(M+60,W-M-60,154,C.bord2);

y=166;
const FSW=(CW-16)/3;
stat(M,         y,FSW,"Rs. 0","Account Opening Fee",C.green);
stat(M+FSW+8,   y,FSW,"5 min","KYC Approval Time",  C.amber);
stat(M+(FSW+8)*2,y,FSW,"24/7", "Customer Support",  C.blue);
y+=82;

// How to start
box(M,y,HCW,160,8,C.card,C.bord2);
gV(M,y,HCW,40,C.amber,0.18,"#000",0);
rr(M,y,4,160,8,C.amber);
B("Get Started in 4 Steps",M+18,y+12,{sz:12,c:C.amber});
const gs=[{n:1,t:"Create your account",  d:"Register with email in 30 seconds -- free"},
          {n:2,t:"Complete KYC",          d:"PAN + Aadhaar verification in under 5 minutes"},
          {n:3,t:"Deposit funds",         d:"INR via UPI or any crypto asset -- instant"},
          {n:4,t:"Start trading",         d:"200+ markets, 12+ product verticals, no minimum"}];
let gsy=y+36;
for(const s of gs){ step(s.n,s.t,s.d,M+18,gsy,HCW-30); gsy+=34; }

// Contact
box(M+HCW+14,y,HCW,160,8,C.card,C.bord2);
gV(M+HCW+14,y,HCW,40,C.green,0.18,"#000",0);
rr(M+HCW+14,y,4,160,8,C.green);
B("Contact & Links",M+HCW+28,y+12,{sz:12,c:C.green});
const co2=[["Website",    "zebvix.com"],["Support","support@zebvix.com"],
           ["Compliance","compliance@zebvix.com"],["Partners","partnerships@zebvix.com"],
           ["Telegram",  "@ZebvixOfficial"],["Twitter","@ZebvixExchange"]];
let cty2=y+36;
for(const[k,v] of co2){
  T(k+":",M+HCW+28,cty2,{sz:8.5,c:C.muted,w:72});
  B(v,     M+HCW+104,cty2,{sz:8.5,c:C.green});
  cty2+=20;
}
B("Zebvix Technologies Private Limited",M+HCW+28,cty2+4,{sz:9,c:C.white});
T("CIN: U66190UW2026PTC251591  |  PAN: AACCZ9728R",M+HCW+28,cty2+18,{sz:8,c:C.muted,w:HCW-20});
T("Incorporated: 10 April 2026, India",M+HCW+28,cty2+30,{sz:8,c:C.muted});
y+=174;

// product chips
const fchips=[
  {l:"Spot Trading",c:C.amber},{l:"Futures 125x",c:C.orange},{l:"Options",c:C.blue},
  {l:"P2P Marketplace",c:C.green},{l:"AI Plans",c:C.amber},{l:"Copy Trading",c:C.blue},
  {l:"Grid & DCA Bots",c:C.orange},{l:"Earn 18% APY",c:C.green},
  {l:"INR Banking",c:C.amber},{l:"KoinX Tax",c:C.blue},
];
let fcx=M; const fcRowY=y;
for(const ch of fchips){
  const cw3=doc.widthOfString(ch.l,{size:8.5})+16;
  if(fcx+cw3>W-M){ fcx=M; y+=22; }
  box(fcx,y,cw3,18,9,ch.c+"22",ch.c+"55",0.5);
  T(ch.l,fcx+8,y+5,{sz:8.5,c:ch.c,f:"Helvetica-Bold"});
  fcx+=cw3+5;
}
y+=30;

// disclaimer
hl(M,W-M,y,C.border); y+=10;
T("DISCLAIMER: Cryptocurrency trading involves significant risk and may not be suitable for all investors. Past performance of AI trading plans and copy trading leaders does not guarantee future results. VDAs are subject to market risk and regulatory change. Zebvix Technologies Private Limited is registered with FIU-IND as a Reporting Entity under PMLA 2002. All fees, rates, and product terms are subject to change with 7 days advance notice. This document is for informational purposes only and does not constitute financial or investment advice. Read our full Terms, Risk Disclosure, AML/KYC Policy and Fee Schedule at zebvix.com before trading.",
  M,y,{sz:7,c:C.dim,w:CW,gap:1.2});

// Bottom bar
fr(0,H-46,W,46,C.gold1); hl(0,W,H-46,C.gold2,0.5);
gH(0,H-46,W,46,C.amber,0.18,"#000",0);
B("Zebvix.",M,H-34,{sz:14,c:C.amber});
T("(c) 2026 Zebvix Technologies Private Limited. All rights reserved.  |  FIU-IND Registered",
  0,H-34,{sz:8.5,c:C.dim,w:W,al:"center"});
B("zebvix.com",W-M-70,H-34,{sz:10,c:C.amber,w:70,al:"right"});

doc.end();
console.log("PDF saved:", OUT);
