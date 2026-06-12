/**
 * Zebvix Platform — Full Brochure PDF Generator (pdfkit)
 * Run: node scripts/generate-brochure.mjs
 */
import PDFDocument from "pdfkit";
import { createWriteStream, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const ASSETS = resolve(ROOT, "attached_assets/features");
const OUT = resolve(ROOT, "docs/Zebvix-Platform-Brochure.pdf");

mkdirSync(resolve(ROOT, "docs"), { recursive: true });

// ─── COLOURS ────────────────────────────────────────────────
const BG      = "#0a0a0a";
const AMBER   = "#f59e0b";
const AMBER2  = "#fbbf24";
const GREEN   = "#10b981";
const WHITE   = "#ffffff";
const LIGHT   = "#e5e5e5";
const MUTED   = "#9ca3af";
const DIM     = "#4b5563";
const CARD_BG = "#111111";
const BORDER  = "#1e1e1e";

// ─── HELPERS ────────────────────────────────────────────────
function img(name) {
  const p = resolve(ASSETS, name);
  return existsSync(p) ? p : null;
}

const doc = new PDFDocument({
  size: "A4",
  margin: 0,
  info: {
    Title: "Zebvix Platform Brochure 2026",
    Author: "Zebvix Technologies Private Limited",
    Subject: "Full platform brochure — Crypto Exchange",
  },
  bufferPages: false,
});

doc.pipe(createWriteStream(OUT));

const W = doc.page.width;   // 595
const H = doc.page.height;  // 842

// ─── PRIMITIVE HELPERS ────────────────────────────────────────
function fill(x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}
function stroke(x, y, w, h, color, lw = 0.5) {
  doc.save().rect(x, y, w, h).lineWidth(lw).stroke(color).restore();
}
function roundRect(x, y, w, h, r, fillColor, strokeColor) {
  doc.save().roundedRect(x, y, w, h, r);
  if (fillColor)  doc.fill(fillColor);
  if (strokeColor) { doc.roundedRect(x, y, w, h, r).lineWidth(0.5).stroke(strokeColor); }
  doc.restore();
}
function line(x1, y1, x2, y2, color = BORDER, lw = 0.5) {
  doc.save().moveTo(x1, y1).lineTo(x2, y2).lineWidth(lw).stroke(color).restore();
}

// Text helpers — returns new y
function text(str, x, y, opts = {}) {
  const {
    size = 10, color = LIGHT, font = "Helvetica",
    width, align = "left", lineGap = 0,
  } = opts;
  doc.save()
    .font(font).fontSize(size).fillColor(color);
  const tOpts = { lineGap };
  if (width) tOpts.width = width;
  if (align) tOpts.align = align;
  doc.text(str, x, y, tOpts);
  doc.restore();
  return doc.y;
}

function bold(str, x, y, opts = {}) {
  return text(str, x, y, { ...opts, font: "Helvetica-Bold" });
}

function label(str, x, y, opts = {}) {
  return text(str.toUpperCase(), x, y, {
    size: 8, color: AMBER, font: "Helvetica-Bold",
    letterSpacing: 2, ...opts,
  });
}

function chip(str, x, y, color = AMBER, bg = null) {
  const tw = doc.widthOfString(str, { size: 8 }) + 16;
  const ch = 14;
  const fillC = bg || (color === AMBER ? "#1c1000" : "#0a1a12");
  roundRect(x, y, tw, ch, 7, fillC, color === AMBER ? "#3a2800" : "#1a3a28");
  doc.save().font("Helvetica-Bold").fontSize(8).fillColor(color)
    .text(str, x + 8, y + 3, { lineBreak: false })
    .restore();
  return tw + 6;
}

function statBox(x, y, w, value, lbl) {
  roundRect(x, y, w, 64, 6, "#0d0d00", "#2a2000");
  bold(value, x, y + 12, { size: 20, color: AMBER, width: w, align: "center" });
  text(lbl.toUpperCase(), x, y + 38, {
    size: 7, color: MUTED, font: "Helvetica-Bold", width: w, align: "center",
  });
}

function sectionHeader(title, subtitle, pageLabel) {
  fill(0, 0, W, H, BG);
  // Top accent bar
  fill(0, 0, W, 4, AMBER);
  // Header area
  fill(0, 4, W, 110, "#0d0d00");
  line(0, 114, W, 114, BORDER, 0.5);

  label(pageLabel, 40, 20);
  bold(title, 40, 38, { size: 26, color: WHITE });
  text(subtitle, 40, 72, { size: 11, color: MUTED, width: W - 80, lineGap: 2 });
}

function addImage(imgName, x, y, w, h) {
  const p = img(imgName);
  if (!p) return;
  doc.save();
  roundRect(x, y, w, h, 8, "#0d0d00", BORDER);
  doc.restore();
  doc.save();
  doc.roundedRect(x + 1, y + 1, w - 2, h - 2, 7).clip();
  doc.image(p, x + 1, y + 1, { fit: [w - 2, h - 2], align: "center", valign: "center" });
  doc.restore();
}

function card(x, y, w, h, fillColor = CARD_BG, strokeColor = BORDER) {
  roundRect(x, y, w, h, 8, fillColor, strokeColor);
}

function footer(pageNum) {
  fill(0, H - 36, W, 36, "#050505");
  line(0, H - 36, W, H - 36, BORDER);
  bold("Zebvix.", 40, H - 24, { size: 12, color: AMBER });
  text("Platform Brochure 2026 — Confidential", W / 2 - 80, H - 24, { size: 8, color: DIM });
  text(`Page ${pageNum}`, W - 80, H - 24, { size: 8, color: DIM });
}

// ═══════════════════════════════════════════════════════════
// PAGE 1: COVER
// ═══════════════════════════════════════════════════════════
fill(0, 0, W, H, BG);
fill(0, 0, W, 4, AMBER); // top bar

// Logo
doc.save().font("Helvetica-Bold").fontSize(52).fillColor(AMBER);
doc.text("Zebvix.", 40, 40, { lineBreak: false });
doc.restore();

// Tagline
text("India's Next-Generation Cryptocurrency Exchange", 40, 104, {
  size: 14, color: MUTED, width: W - 80,
});

// Hero image
addImage("hero-banner.png", 30, 135, W - 60, (W - 60) * 9/16);

// Badges row 1
const BY1 = 135 + (W - 60) * 9/16 + 20;
let bx = 30;
const badges1 = ["🏛️ FIU-IND Registered", "🔐 Bank-Grade Security", "⚡ 200+ Markets"];
for (const b of badges1) {
  const tw = doc.widthOfString(b, { size: 9 }) + 22;
  roundRect(bx, BY1, tw, 22, 11, "#140d00", "#3a2800");
  text(b, bx + 11, BY1 + 7, { size: 9, color: AMBER });
  bx += tw + 8;
}
// Badges row 2
let bx2 = 30;
const BY2 = BY1 + 30;
const badges2 = ["🇮🇳 Built for India", "📊 Spot · Futures · Options", "🤖 AI Trading Plans"];
for (const b of badges2) {
  const tw = doc.widthOfString(b, { size: 9 }) + 22;
  roundRect(bx2, BY2, tw, 22, 11, "#140d00", "#3a2800");
  text(b, bx2 + 11, BY2 + 7, { size: 9, color: AMBER });
  bx2 += tw + 8;
}

// Bottom meta
const metaY = BY2 + 36;
line(30, metaY, W - 30, metaY, BORDER);
text(
  "Zebvix Technologies Private Limited  |  CIN: U66190UW2026PTC251591  |  FIU-IND Registered",
  30, metaY + 10, { size: 9, color: DIM, width: W - 60, align: "center" }
);
text("Full Platform Brochure · June 2026 · Confidential", 30, metaY + 24, {
  size: 8, color: "#3a3a3a", width: W - 60, align: "center",
});

// ═══════════════════════════════════════════════════════════
// PAGE 2: INTRODUCTION
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Welcome to Zebvix",
  "A full-featured, production-ready crypto exchange engineered for the Indian market — combining\ninstitutional-grade infrastructure with a world-class user experience.",
  "01 — Introduction"
);

let y = 130;
const M = 40; const CW = (W - M * 2 - 12) / 3;

// Stat boxes
statBox(M, y, CW, "200+", "Trading Markets");
statBox(M + CW + 6, y, CW, "12+", "Product Verticals");
statBox(M + (CW + 6) * 2, y, CW, "125×", "Max Futures Leverage");

y += 82;

// Two cards
const HCW = (W - M * 2 - 12) / 2;
card(M, y, HCW, 110, CARD_BG, BORDER);
bold("🏢  Company", M + 14, y + 14, { size: 11, color: WHITE });
text("Zebvix Technologies Private Limited", M + 14, y + 32, { size: 9, color: MUTED, width: HCW - 28 });
text("CIN: U66190UW2026PTC251591", M + 14, y + 46, { size: 9, color: MUTED });
text("PAN: AACCZ9728R", M + 14, y + 60, { size: 9, color: MUTED });
text("Incorporated: 10 April 2026, India", M + 14, y + 74, { size: 9, color: MUTED });

card(M + HCW + 12, y, HCW, 110, CARD_BG, BORDER);
bold("🏛️  Regulatory Status", M + HCW + 26, y + 14, { size: 11, color: WHITE });
bold("FIU-IND Registered", M + HCW + 26, y + 32, { size: 10, color: GREEN });
text("Reporting Entity under PMLA 2002.", M + HCW + 26, y + 46, { size: 9, color: MUTED, width: HCW - 28 });
text("SEBI VDA guidelines, IT Act 194S (TDS)", M + HCW + 26, y + 60, { size: 9, color: MUTED, width: HCW - 28 });
text("and RBI fiat payment rails compliance.", M + HCW + 26, y + 74, { size: 9, color: MUTED, width: HCW - 28 });

y += 122;

// Mission highlight
roundRect(M, y, W - M * 2, 68, 8, "#0d0800", "#3a2800");
bold("Our Mission", M + 16, y + 14, { size: 11, color: AMBER });
text(
  "To democratize access to global digital asset markets for every Indian — from first-time retail investors to\ninstitutional trading desks — through best-in-class technology, transparent pricing, and full regulatory compliance.",
  M + 16, y + 30, { size: 10, color: LIGHT, width: W - M * 2 - 32, lineGap: 2 }
);

y += 82;

// Two more cards
card(M, y, HCW, 100, CARD_BG, BORDER);
bold("⚡  Technology Stack", M + 14, y + 14, { size: 11, color: WHITE });
text(
  "Node.js 24 + Express 5 API server with Redis-backed\nspot matching engine. Dedicated Go 1.22 futures\nengine for ultra-low latency. WebSocket feeds.",
  M + 14, y + 32, { size: 9, color: MUTED, width: HCW - 28, lineGap: 2 }
);

card(M + HCW + 12, y, HCW, 100, CARD_BG, BORDER);
bold("🇮🇳  India-First Features", M + HCW + 26, y + 14, { size: 11, color: WHITE });
text(
  "Native INR: UPI, IMPS, NEFT, RTGS via Razorpay.\n1% TDS auto-deduction (IT Act 194S). KoinX\nintegration. Schedule VDA tax reports.",
  M + HCW + 26, y + 32, { size: 9, color: MUTED, width: HCW - 28, lineGap: 2 }
);

footer(2);

// ═══════════════════════════════════════════════════════════
// PAGE 3: SPOT TRADING
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Spot Trading",
  "Professional-grade spot exchange with Limit, Market, and Stop orders across 200+ BTC, ETH, USDT and INR pairs.",
  "02 — Core Trading"
);

y = 130;
addImage("spot-trading.png", M, y, W - M * 2, (W - M * 2) * 9 / 16);
y += (W - M * 2) * 9 / 16 + 14;

const C3W = (W - M * 2 - 20) / 3;
card(M, y, C3W, 90, CARD_BG, BORDER);
bold("📈  Order Types", M + 12, y + 12, { size: 10, color: WHITE });
text("Limit, Market, Stop-Limit orders with ±10% slippage protection on market orders. Real-time order status.", M + 12, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

card(M + C3W + 10, y, C3W, 90, CARD_BG, BORDER);
bold("⚡  Matching Engine", M + C3W + 22, y + 12, { size: 10, color: WHITE });
text("In-memory Redis ZSET orderbook with price-time FIFO priority. Sub-millisecond fills. Self-trade prevention.", M + C3W + 22, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

card(M + (C3W + 10) * 2, y, C3W, 90, CARD_BG, BORDER);
bold("💹  TDS Compliance", M + (C3W + 10) * 2 + 12, y + 12, { size: 10, color: WHITE });
text("1% TDS auto-deducted from seller's proceeds on every fill per IT Act Section 194S. Auto-reported to ITD.", M + (C3W + 10) * 2 + 12, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

footer(3);

// ═══════════════════════════════════════════════════════════
// PAGE 4: FUTURES TRADING
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Perpetual Futures",
  "High-performance futures engine built in Go — trade with up to 125× leverage on perpetual contracts with hourly funding rates.",
  "03 — Derivatives"
);

y = 130;
addImage("futures-trading.png", M, y, W - M * 2, (W - M * 2) * 9 / 16);
y += (W - M * 2) * 9 / 16 + 14;

card(M, y, C3W, 90, CARD_BG, BORDER);
bold("⚡  Go Engine", M + 12, y + 12, { size: 10, color: WHITE });
text("Dedicated Go 1.22 matching engine. Per-pair mutex, in-memory FIFO, stateless returns to Node.js for DB.", M + 12, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

card(M + C3W + 10, y, C3W, 90, CARD_BG, BORDER);
bold("🛡️  Risk Controls", M + C3W + 22, y + 12, { size: 10, color: WHITE });
text("Isolated margin, auto-liquidation below maintenance margin, insurance fund, and self-trade prevention.", M + C3W + 22, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

card(M + (C3W + 10) * 2, y, C3W, 90, CARD_BG, BORDER);
bold("📡  Leverage Tiers", M + (C3W + 10) * 2 + 12, y + 12, { size: 10, color: WHITE });
text("Regular 20× · VIP1 30× · VIP2 50×\nVIP3 75× · VIP4 100× · VIP5 125×", M + (C3W + 10) * 2 + 12, y + 28, { size: 9, color: AMBER, width: C3W - 24, lineGap: 3 });
text("Funding: hourly. Liquidation fee: 0.30%.", M + (C3W + 10) * 2 + 12, y + 60, { size: 9, color: MUTED, width: C3W - 24 });

footer(4);

// ═══════════════════════════════════════════════════════════
// PAGE 5: OPTIONS + P2P (two features per page)
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Options & P2P Trading",
  "European-style options with Black-Scholes pricing, plus escrow-protected P2P marketplace with dispute resolution.",
  "04 & 05 — Derivatives & Marketplace"
);

y = 130;
const HW = (W - M * 2 - 14) / 2;

// Options left
card(M, y, HW, 34, CARD_BG, "#2a1800");
bold("🎯  Options Trading", M + 12, y + 10, { size: 11, color: AMBER });
y += 40;
addImage("options-trading.png", M, y, HW, HW * 9 / 16);
const opsImgH = HW * 9 / 16;
y += opsImgH + 8;
text("European Call & Put options priced via Black-Scholes.\nFull Greeks: Δ Delta, Γ Gamma, Θ Theta, ν Vega.\nLong: pay premium upfront. Short: lock collateral.", M, y, { size: 9, color: MUTED, width: HW, lineGap: 2 });

// P2P right
const PX = M + HW + 14;
let ry = 130;
card(PX, ry, HW, 34, CARD_BG, "#2a1800");
bold("🤝  P2P Trading", PX + 12, ry + 10, { size: 11, color: AMBER });
ry += 40;
addImage("p2p-trading.png", PX, ry, HW, HW * 9 / 16);
ry += HW * 9 / 16 + 8;
text("Escrow-protected OTC marketplace. Buyers & sellers\ntransact directly. Crypto locked in escrow until seller\nconfirms payment. 24h dispute resolution SLA.", PX, ry, { size: 9, color: MUTED, width: HW, lineGap: 2 });

ry += 50;
// P2P steps mini
const steps = ["Seller posts ad", "Buyer opens order → escrow locked", "Buyer pays → marks paid", "Seller releases → crypto sent"];
for (let i = 0; i < steps.length; i++) {
  roundRect(PX, ry, 18, 18, 9, "#1c1000", "#3a2800");
  bold(`${i + 1}`, PX + 6, ry + 5, { size: 7, color: AMBER });
  text(steps[i], PX + 24, ry + 4, { size: 9, color: LIGHT });
  ry += 22;
}

footer(5);

// ═══════════════════════════════════════════════════════════
// PAGE 6: AI TRADING
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "AI Trading Plans",
  "Professionally managed AI-driven investment plans with configurable risk levels and automated daily returns — no experience needed.",
  "06 — AI Products"
);

y = 130;
addImage("ai-trading.png", M, y, W - M * 2, (W - M * 2) * 9 / 16);
y += (W - M * 2) * 9 / 16 + 14;

card(M, y, C3W, 90, CARD_BG, BORDER);
bold("🤖  Automated Returns", M + 12, y + 12, { size: 10, color: WHITE });
text("AI engine trades on your behalf. Daily returns 0.8%–2.5%. Fixed duration (7–365 days) or open-ended.", M + 12, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

card(M + C3W + 10, y, C3W, 90, CARD_BG, BORDER);
bold("📋  Plan Tiers", M + C3W + 22, y + 12, { size: 10, color: WHITE });
text("Conservative · Moderate · Aggressive plans available. Minimum investment from 50 USDT. Principal + returns at maturity.", M + C3W + 22, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

card(M + (C3W + 10) * 2, y, C3W, 90, CARD_BG, BORDER);
bold("📑  Tax Compliant", M + (C3W + 10) * 2 + 12, y + 12, { size: 10, color: WHITE });
text("1% TDS auto-deducted at each earning. Schedule VDA invoice download for ITR-2/3 filing. Fully 194S compliant.", M + (C3W + 10) * 2 + 12, y + 28, { size: 9, color: MUTED, width: C3W - 24, lineGap: 2 });

footer(6);

// ═══════════════════════════════════════════════════════════
// PAGE 7: COPY TRADING + BOTS
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Copy Trading & Bots",
  "Follow India's top traders automatically, or run 24/7 Grid and DCA bots — let the platform trade on your behalf.",
  "07 & 08 — Social & Automation"
);

y = 130;

// Copy Trading left
card(M, y, HW, 34, CARD_BG, "#2a1800");
bold("👥  Copy Trading", M + 12, y + 10, { size: 11, color: AMBER });
y += 40;
addImage("copy-trading.png", M, y, HW, HW * 9 / 16);
let cty = y + HW * 9 / 16 + 8;
text("Browse ranked leaderboard (30d PnL, win rate, AUM).\nSet allocation, copy ratio 0–5×, max risk per trade.\nUnfollow anytime. KYC L1+ required to be a leader.", M, cty, { size: 9, color: MUTED, width: HW, lineGap: 2 });

// Bots right
let boty = 130;
card(PX, boty, HW, 34, CARD_BG, "#2a1800");
bold("⚙️  Trading Bots", PX + 12, boty + 10, { size: 11, color: AMBER });
boty += 40;
addImage("trading-bots.png", PX, boty, HW, HW * 9 / 16);
boty += HW * 9 / 16 + 8;
text("Grid Bot: places buy/sell orders in a price range,\nprofits from oscillation.\n\nDCA Bot: buys fixed amount at regular intervals.\nReduces volatility impact. Configure interval, cap, size.", PX, boty, { size: 9, color: MUTED, width: HW, lineGap: 2 });

footer(7);

// ═══════════════════════════════════════════════════════════
// PAGE 8: EARN + WALLET
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Earn/Staking & Wallet",
  "Earn up to 18% APY on 30+ assets with Fixed and Flexible products. Secure multi-chain custodial wallet.",
  "09 & 10 — Passive Income & Wallet"
);

y = 130;

card(M, y, HW, 34, CARD_BG, "#2a1800");
bold("💰  Earn / Staking", M + 12, y + 10, { size: 11, color: AMBER });
y += 40;
addImage("earn-staking.png", M, y, HW, HW * 9 / 16);
let ey = y + HW * 9 / 16 + 8;
text("Fixed: lock assets 7–365 days, earn higher APY.\nFlexible: withdraw anytime, accrues daily.\n30+ assets. Up to 18% APY. TDS-compliant.", M, ey, { size: 9, color: MUTED, width: HW, lineGap: 2 });

let wy = 130;
card(PX, wy, HW, 34, CARD_BG, "#2a1800");
bold("👛  Multi-Asset Wallet", PX + 12, wy + 10, { size: 11, color: AMBER });
wy += 40;
addImage("crypto-wallet.png", PX, wy, HW, HW * 9 / 16);
wy += HW * 9 / 16 + 8;
text("BTC · ERC-20 · BEP-20 · TRC-20 · Solana · Polygon\n· Avalanche · Zebvix L1 and more.\nAES-256-GCM key encryption. 98% cold storage.\nDouble-entry ledger for all transactions.", PX, wy, { size: 9, color: MUTED, width: HW, lineGap: 2 });

footer(8);

// ═══════════════════════════════════════════════════════════
// PAGE 9: INR PAYMENTS + KOINX
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "INR Payments & KoinX",
  "Seamless Indian Rupee rails via UPI, IMPS, NEFT, RTGS — plus native KoinX integration for effortless crypto tax filing.",
  "11 & 12 — INR Banking & Tax"
);

y = 130;

card(M, y, HW, 34, CARD_BG, "#2a1800");
bold("🏦  INR Payments", M + 12, y + 10, { size: 11, color: AMBER });
y += 40;
addImage("inr-payments.png", M, y, HW, HW * 9 / 16);
let iy = y + HW * 9 / 16 + 8;
text("Deposit: UPI (free ≤₹5K / 0.5% above), IMPS free,\nNEFT/RTGS free. Withdrawal: UPI ₹15 flat, IMPS ₹10,\nNEFT free. Min withdraw ₹100. KYC L2 required.", M, iy, { size: 9, color: MUTED, width: HW, lineGap: 2 });

let ky = 130;
card(PX, ky, HW, 34, CARD_BG, "#2a1800");
bold("📊  KoinX Integration", PX + 12, ky + 10, { size: 11, color: AMBER });
ky += 40;
addImage("koinx-integration.png", PX, ky, HW, HW * 9 / 16);
ky += HW * 9 / 16 + 8;
text("Auto-sync spot trades, deposits & withdrawals to\nKoinX for VDA tax computation. Schedule VDA ITR\nreport for ITR-2/3. Fully FY2024-25 compliant.\nCreate read-only API key in Settings to connect.", PX, ky, { size: 9, color: MUTED, width: HW, lineGap: 2 });

footer(9);

// ═══════════════════════════════════════════════════════════
// PAGE 10: CONVERT + PORTFOLIO + LEAGUES + REFERRAL
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Convert, Portfolio, Leagues & Referrals",
  "Instant swaps, professional analytics, trading leagues and a 30% lifetime referral commission program.",
  "13 — Tools & Growth"
);

y = 130;
const Q = (W - M * 2 - 18) / 4;

// 4 images in a row
addImage("convert-swap.png", M, y, Q, Q * 9 / 16);
addImage("portfolio-analytics.png", M + Q + 6, y, Q, Q * 9 / 16);
addImage("trading-leagues.png", M + (Q + 6) * 2, y, Q, Q * 9 / 16);
addImage("referral-program.png", M + (Q + 6) * 3, y, Q, Q * 9 / 16);

const imgH4 = Q * 9 / 16;
y += imgH4 + 10;

// 4 mini headings
bold("⚡ Convert", M, y, { size: 10, color: AMBER });
bold("📊 Portfolio", M + Q + 6, y, { size: 10, color: AMBER });
bold("🏆 Leagues", M + (Q + 6) * 2, y, { size: 10, color: AMBER });
bold("🎁 Referrals", M + (Q + 6) * 3, y, { size: 10, color: AMBER });

y += 16;
const descs = [
  "Swap any two assets at real-time rates. Quote locked 10 seconds. No slippage uncertainty.",
  "PnL by asset, equity curve, Sharpe ratio, drawdown. Schedule VDA export for ITR.",
  "Competitive leagues with prize pools. Ranked by PnL%. Win ZBX and USDT rewards.",
  "Earn 30% of every fee paid by referred users — as ZBX. Lifetime, no cap. Unique link + QR.",
];
for (let i = 0; i < 4; i++) {
  text(descs[i], M + (Q + 6) * i, y, { size: 8.5, color: MUTED, width: Q, lineGap: 1.5 });
}

y += 70;

// Referral highlight box
roundRect(M, y, W - M * 2, 72, 8, "#0d0800", "#3a2800");
bold("30% Lifetime Referral Commission", M + 16, y + 14, { size: 13, color: AMBER });
text(
  "Earn 30% of every trading fee paid by users you refer — credited instantly as ZBX token. No cap, no expiry, no tiers.\nShare your unique link or QR code from the Referrals page. Track earnings in real-time.",
  M + 16, y + 34, { size: 10, color: LIGHT, width: W - M * 2 - 32, lineGap: 2 }
);

y += 86;

// ZBX discount card
roundRect(M, y, W - M * 2, 60, 8, "#0a1205", "#1a3a25");
bold("🟡  ZBX Token Discounts", M + 16, y + 14, { size: 11, color: GREEN });
text(
  "Hold ZBX in your wallet:  25% off all spot trading fees  ·  10% off futures fees  ·  Applied automatically every trade.",
  M + 16, y + 34, { size: 10, color: LIGHT, width: W - M * 2 - 32 }
);

footer(10);

// ═══════════════════════════════════════════════════════════
// PAGE 11: FEE SCHEDULE — SPOT & FUTURES
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Fee Schedule",
  "Transparent, competitive fees with generous discounts for ZBX holders and high-volume VIP traders.",
  "14 — Pricing"
);

y = 130;

// ── Spot fee table ──────────────────────────────────────────
label("SPOT TRADING FEES", M, y);
y += 16;

const TW = W - M * 2;
const COLS = [100, 110, 100, 60, 60];
const HEADERS = ["TIER", "30-DAY VOLUME", "ZBX BALANCE", "MAKER", "TAKER"];
const spotRows = [
  ["Regular", "< $100K",  "≥ 0",         "0.10%",  "0.10%"],
  ["VIP 1",  "≥ $100K",  "≥ 250 ZBX",   "0.090%", "0.100%"],
  ["VIP 2",  "≥ $500K",  "≥ 1,000 ZBX", "0.080%", "0.090%"],
  ["VIP 3",  "≥ $2M",    "≥ 5,000 ZBX", "0.060%", "0.080%"],
  ["VIP 4",  "≥ $10M",   "≥ 25,000 ZBX","0.040%", "0.060%"],
  ["VIP 5",  "≥ $50M",   "≥ 100K ZBX",  "0.020%", "0.040%"],
  ["VIP 6",  "≥ $250M",  "Custom",       "0.000%", "0.030%"],
];

// Header row
fill(M, y, TW, 22, "#1c1000");
stroke(M, y, TW, 22, "#3a2800", 0.5);
let cx = M;
for (let i = 0; i < HEADERS.length; i++) {
  text(HEADERS[i], cx + 10, y + 7, { size: 7.5, color: AMBER, font: "Helvetica-Bold", width: COLS[i] - 10 });
  cx += COLS[i];
}
y += 22;
for (const [idx, row] of spotRows.entries()) {
  const rowBg = idx % 2 === 0 ? "#0d0d0d" : CARD_BG;
  fill(M, y, TW, 18, rowBg);
  stroke(M, y, TW, 18, "#181818", 0.3);
  cx = M;
  for (let i = 0; i < row.length; i++) {
    const color = i >= 3 ? GREEN : (i === 0 ? AMBER : MUTED);
    const font = i === 0 ? "Helvetica-Bold" : "Helvetica";
    text(row[i], cx + 10, y + 5, { size: 9, color, font, width: COLS[i] - 10 });
    cx += COLS[i];
  }
  y += 18;
}

y += 14;

// ── Futures fee table ────────────────────────────────────────
label("FUTURES TRADING FEES", M, y);
y += 16;

const FCOLS  = [100, 120, 80, 80, 100];
const FHEADS = ["TIER", "30-DAY VOLUME", "MAKER", "TAKER", "MAX LEVERAGE"];
const futRows = [
  ["Regular", "< $1M",   "0.020%", "0.050%", "20×"],
  ["VIP 1",  "≥ $1M",   "0.016%", "0.045%", "30×"],
  ["VIP 2",  "≥ $10M",  "0.014%", "0.040%", "50×"],
  ["VIP 3",  "≥ $50M",  "0.012%", "0.035%", "75×"],
  ["VIP 4",  "≥ $250M", "0.010%", "0.030%", "100×"],
  ["VIP 5",  "≥ $1B",   "0.005%", "0.025%", "125×"],
];

fill(M, y, TW, 22, "#1c1000");
stroke(M, y, TW, 22, "#3a2800", 0.5);
cx = M;
for (let i = 0; i < FHEADS.length; i++) {
  text(FHEADS[i], cx + 10, y + 7, { size: 7.5, color: AMBER, font: "Helvetica-Bold", width: FCOLS[i] - 10 });
  cx += FCOLS[i];
}
y += 22;
for (const [idx, row] of futRows.entries()) {
  const rowBg = idx % 2 === 0 ? "#0d0d0d" : CARD_BG;
  fill(M, y, TW, 18, rowBg);
  stroke(M, y, TW, 18, "#181818", 0.3);
  cx = M;
  for (let i = 0; i < row.length; i++) {
    const color = i >= 2 ? GREEN : (i === 0 ? AMBER : MUTED);
    const font = i === 0 ? "Helvetica-Bold" : "Helvetica";
    text(row[i], cx + 10, y + 5, { size: 9, color, font, width: FCOLS[i] - 10 });
    cx += FCOLS[i];
  }
  y += 18;
}

y += 14;

// 3 benefit boxes
const bW = (TW - 20) / 3;
roundRect(M, y, bW, 52, 6, "#0d0800", "#3a2800");
bold("💎  ZBX Discount", M + 10, y + 10, { size: 9.5, color: AMBER });
text("25% off spot · 10% off futures.\nApplied automatically when you\nhold ZBX in spot wallet.", M + 10, y + 26, { size: 8.5, color: MUTED, width: bW - 20, lineGap: 1.5 });

roundRect(M + bW + 10, y, bW, 52, 6, "#0d0800", "#3a2800");
bold("🎁  First-Week Offer", M + bW + 20, y + 10, { size: 9.5, color: AMBER });
text("0% maker & taker fees on your\nfirst ₹50,000 spot trading volume\nin your first 7 days.", M + bW + 20, y + 26, { size: 8.5, color: MUTED, width: bW - 20, lineGap: 1.5 });

roundRect(M + (bW + 10) * 2, y, bW, 52, 6, "#0d0800", "#3a2800");
bold("🔗  Referral Kickback", M + (bW + 10) * 2 + 10, y + 10, { size: 9.5, color: AMBER });
text("Earn 30% of fees from referred\nusers. Credited instantly as ZBX.\nLifetime, no cap.", M + (bW + 10) * 2 + 10, y + 26, { size: 8.5, color: MUTED, width: bW - 20, lineGap: 1.5 });

footer(11);

// ═══════════════════════════════════════════════════════════
// PAGE 12: DEPOSIT & WITHDRAWAL FEES
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Deposit & Withdrawal Fees",
  "All crypto deposits are free. Withdrawal fees are pass-through network fees plus a small handling charge.",
  "15 — Funding Fees"
);

y = 130;
const DCOLS = [80, 90, 150, 120, 100];
const DHEADS = ["ASSET", "NETWORK", "DEPOSIT FEE", "WITHDRAWAL FEE", "MIN WITHDRAW"];
const depRows = [
  ["INR", "UPI",       "Free (≤₹5K) / 0.50%", "₹15 flat",      "₹100"],
  ["INR", "IMPS",      "Free",                  "₹10 flat",      "₹100"],
  ["INR", "NEFT",      "Free",                  "Free",          "₹500"],
  ["USDT","TRC-20",    "Free",                  "1 USDT",        "10 USDT"],
  ["USDT","ERC-20",    "Free",                  "5 USDT",        "20 USDT"],
  ["USDT","BEP-20",    "Free",                  "0.30 USDT",     "10 USDT"],
  ["USDT","Zebvix L1", "Free",                  "0.10 USDT",     "1 USDT"],
  ["BTC", "Bitcoin",   "Free",                  "0.0002 BTC",    "0.001 BTC"],
  ["ETH", "ERC-20",    "Free",                  "0.003 ETH",     "0.01 ETH"],
  ["ETH", "Zebvix L1", "Free",                  "0.0005 ETH",    "0.005 ETH"],
  ["BNB", "BEP-20",    "Free",                  "0.0008 BNB",    "0.01 BNB"],
  ["SOL", "Solana",    "Free",                  "0.01 SOL",      "0.05 SOL"],
  ["ZBX", "Zebvix L1", "Free",                  "0.50 ZBX",      "5 ZBX"],
];

fill(M, y, TW, 22, "#1c1000");
stroke(M, y, TW, 22, "#3a2800", 0.5);
cx = M;
for (let i = 0; i < DHEADS.length; i++) {
  text(DHEADS[i], cx + 8, y + 7, { size: 7.5, color: AMBER, font: "Helvetica-Bold", width: DCOLS[i] - 8 });
  cx += DCOLS[i];
}
y += 22;
for (const [idx, row] of depRows.entries()) {
  const rowBg = idx % 2 === 0 ? "#0d0d0d" : CARD_BG;
  fill(M, y, TW, 18, rowBg);
  stroke(M, y, TW, 18, "#181818", 0.3);
  cx = M;
  for (let i = 0; i < row.length; i++) {
    let color = MUTED;
    if (i === 0) color = AMBER;
    if (i === 2 && row[i] === "Free") color = GREEN;
    const font = (i === 0 || row[i] === "Free") ? "Helvetica-Bold" : "Helvetica";
    text(row[i], cx + 8, y + 5, { size: 8.5, color, font, width: DCOLS[i] - 8 });
    cx += DCOLS[i];
  }
  y += 18;
}

y += 18;

// TDS box
roundRect(M, y, TW, 72, 8, "#0d0800", "#3a2800");
bold("🇮🇳  Indian Tax (TDS — Section 194S)", M + 16, y + 14, { size: 11, color: AMBER });
text(
  "1% TDS (Tax Deducted at Source) is automatically deducted from the seller's proceeds on every spot trade\nand AI trading earning. This is deposited with the Government of India on your behalf.\nYou receive a TDS certificate and Schedule VDA report for your Income Tax Return (ITR) filing.",
  M + 16, y + 32, { size: 9.5, color: LIGHT, width: TW - 32, lineGap: 2 }
);

footer(12);

// ═══════════════════════════════════════════════════════════
// PAGE 13: KYC & SECURITY
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "KYC, Security & Compliance",
  "Bank-grade security, multi-layer AML/KYC framework, and full Indian regulatory compliance protecting every user.",
  "16 — Compliance & Security"
);

y = 130;

// KYC table left, security layers right
card(M, y, HW, 34, CARD_BG, "#2a1800");
bold("🛡️  KYC Tiers", M + 12, y + 10, { size: 11, color: AMBER });
y += 40;

addImage("kyc-verification.png", M, y, HW, HW * 9 / 16);
let kycy = y + HW * 9 / 16 + 8;

const kycRows = [
  ["Level 0", "Email verified", "View markets"],
  ["Level 1", "PAN card", "Spot, P2P, INR deposits"],
  ["Level 2", "Aadhaar + Selfie", "Withdrawals, AI, Futures"],
  ["Level 3", "EDD documents", "Institutional limits"],
];
const KC = [60, 110, 145];
fill(M, kycy, HW, 20, "#1c1000");
["LEVEL", "REQUIREMENT", "UNLOCKS"].forEach((h, i) => {
  text(h, M + KC.slice(0, i).reduce((a, b) => a + b, 0) + 8, kycy + 6,
    { size: 7, color: AMBER, font: "Helvetica-Bold" });
});
kycy += 20;
for (const [idx, row] of kycRows.entries()) {
  fill(M, kycy, HW, 16, idx % 2 === 0 ? "#0d0d0d" : CARD_BG);
  let kcx = M;
  row.forEach((cell, i) => {
    const color = i === 0 ? AMBER : (i === 2 ? GREEN : MUTED);
    text(cell, kcx + 8, kycy + 4, { size: 8, color, width: KC[i] - 8 });
    kcx += KC[i];
  });
  kycy += 16;
}

// Security right
let secy = 130;
card(PX, secy, HW, 34, CARD_BG, "#2a1800");
bold("🔐  Security Architecture", PX + 12, secy + 10, { size: 11, color: AMBER });
secy += 40;

addImage("security-architecture.png", PX, secy, HW, HW * 9 / 16);
secy += HW * 9 / 16 + 8;

const secItems = [
  "Session cookies — SameSite=Strict, HttpOnly",
  "TOTP 2FA — Google Authenticator",
  "HMAC-SHA256 API key authentication",
  "AES-256-GCM wallet key encryption",
  "CSRF guard — Origin/Referer validation",
  "Redis rate limiting — multi-tier per IP",
  "Zod v4 input validation on all routes",
  "Immutable admin audit log",
  "OFAC / UN / EU / MHA sanctions screening",
  "Proof-of-work bot protection on registration",
];
for (const item of secItems) {
  bold("✅", PX + 8, secy, { size: 8.5, color: GREEN });
  text(item, PX + 22, secy, { size: 8.5, color: MUTED, width: HW - 30 });
  secy += 14;
}

// Compliance badges
const totalY = Math.max(kycy, secy) + 14;
const badges = ["🏛️ FIU-IND Registered", "📋 PMLA 2002 Compliant", "💰 TDS 194S Compliant", "🛡️ OFAC Screened", "🇮🇳 RBI Rail Licensed", "📑 Schedule VDA Ready"];
let badgeX = M;
for (const b of badges) {
  const bw = doc.widthOfString(b, { size: 9 }) + 22;
  roundRect(badgeX, totalY, bw, 20, 10, "#0a1205", "#1a3a25");
  text(b, badgeX + 11, totalY + 6, { size: 8.5, color: GREEN });
  badgeX += bw + 6;
  if (badgeX + bw > W - M) { badgeX = M; }
}

footer(13);

// ═══════════════════════════════════════════════════════════
// PAGE 14: GET STARTED / CONTACT
// ═══════════════════════════════════════════════════════════
doc.addPage();
sectionHeader(
  "Join Zebvix Today",
  "Create your account in minutes. KYC in under 5 minutes. Start trading India's most advanced crypto exchange.",
  "17 — Get Started"
);

y = 130;

statBox(M, y, CW, "₹0", "Account Opening Fee");
statBox(M + CW + 6, y, CW, "5 min", "KYC Approval");
statBox(M + (CW + 6) * 2, y, CW, "24/7", "Support");

y += 80;

card(M, y, HW, 170, CARD_BG, "#2a1800");
bold("🚀  How to Start", M + 14, y + 14, { size: 11, color: AMBER });
const howSteps = [
  ["1", "Sign up", "Register with email — 30 seconds"],
  ["2", "Complete KYC", "PAN + Aadhaar in under 5 minutes"],
  ["3", "Deposit funds", "INR via UPI or crypto — instant credit"],
  ["4", "Start trading", "200+ markets, 12+ product verticals"],
];
let sy = y + 34;
for (const [num, title, desc] of howSteps) {
  roundRect(M + 14, sy, 20, 20, 10, "#1c1000", "#3a2800");
  bold(num, M + 21, sy + 6, { size: 8, color: AMBER });
  bold(title, M + 42, sy + 3, { size: 9.5, color: WHITE });
  text(desc, M + 42, sy + 16, { size: 8.5, color: MUTED });
  sy += 32;
}

card(M + HW + 14, y, HW, 170, CARD_BG, BORDER);
bold("📞  Contact Us", M + HW + 26, y + 14, { size: 11, color: AMBER });
const contacts = [
  ["🌐", "zebvix.com"],
  ["📧", "support@zebvix.com"],
  ["📧", "compliance@zebvix.com"],
  ["📧", "partnerships@zebvix.com"],
];
let cy2 = y + 36;
for (const [icon, val] of contacts) {
  text(icon, M + HW + 26, cy2, { size: 10 });
  text(val, M + HW + 44, cy2, { size: 10, color: AMBER });
  cy2 += 18;
}
cy2 += 8;
bold("Zebvix Technologies Pvt. Ltd.", M + HW + 26, cy2, { size: 9, color: WHITE });
cy2 += 14;
text("CIN: U66190UW2026PTC251591", M + HW + 26, cy2, { size: 8.5, color: MUTED });
cy2 += 12;
text("Incorporated: 10 April 2026 · India", M + HW + 26, cy2, { size: 8.5, color: MUTED });

y += 184;

// Final brand box
roundRect(M, y, W - M * 2, 100, 10, "#0d0800", "#3a2800");
doc.save().font("Helvetica-Bold").fontSize(32).fillColor(AMBER)
  .text("Zebvix.", M, y + 18, { width: W - M * 2, align: "center", lineBreak: false })
  .restore();
text("India's Next-Generation Cryptocurrency Exchange", M, y + 58, {
  size: 12, color: MUTED, width: W - M * 2, align: "center",
});
let fbx = M + 40;
const fbadges = ["Spot · Futures · Options", "P2P · AI Plans · Copy Trading", "Earn · Bots · Convert · Tax"];
for (const b of fbadges) {
  const bw = doc.widthOfString(b, { size: 8.5 }) + 18;
  roundRect(fbx, y + 78, bw, 16, 8, "#1c1000", "#3a2800");
  text(b, fbx + 9, y + 83, { size: 8.5, color: AMBER });
  fbx += bw + 8;
}

y += 112;

// Disclaimer
text(
  "Disclaimer: Cryptocurrency trading involves significant risk. Past performance does not guarantee future results. Virtual Digital Assets (VDAs) are subject to market and regulatory risk. Zebvix is registered with FIU-IND under PMLA 2002. 1% TDS applies per IT Act Sec 194S. All fees subject to change with 7 days advance notice. This document is for informational purposes only and does not constitute financial advice. Please read our Terms of Service, Risk Disclosure and AML/KYC Policy at zebvix.com.",
  M, y, { size: 7.5, color: DIM, width: W - M * 2, lineGap: 1.5 }
);

fill(0, H - 36, W, 36, "#050505");
line(0, H - 36, W, H - 36, BORDER);
bold("Zebvix.", 40, H - 24, { size: 12, color: AMBER });
text("© 2026 Zebvix Technologies Private Limited. All rights reserved.", W / 2 - 120, H - 24, { size: 8, color: DIM });
text("Page 14", W - 80, H - 24, { size: 8, color: DIM });

// ─── DONE ────────────────────────────────────────────────
doc.end();
console.log("✅  PDF saved to:", OUT);
