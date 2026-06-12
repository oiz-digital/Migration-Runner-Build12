# Zebvix — Compiled Compliance & Trade Policy Document

**Entity:** Zebvix Technologies Private Limited  
**Registered office:** Bengaluru, India  
**Regulatory status:** Reporting Entity registered with FIU-IND under PMLA 2002  
**Effective date:** 26 April 2026 | Version: 2.5  
**Compliance contact:** compliance@zebvix.com  

---

## PART A — ANTI-MONEY LAUNDERING (AML) / COUNTER-TERRORIST FINANCING (CFT) POLICY

### A.1 Commitment

Zebvix Technologies Private Limited ("Zebvix") is fully committed to preventing the use of its platform for money laundering, terrorist financing, and proliferation financing. As a Reporting Entity with the Financial Intelligence Unit-India (FIU-IND) under the Prevention of Money Laundering Act, 2002 ("PMLA"), we maintain a comprehensive, risk-based AML/CFT programme aligned with FATF Recommendations and Indian regulatory guidance.

### A.2 Regulatory Framework

Our programme is built around:

| Instrument | Scope |
|-----------|-------|
| Prevention of Money Laundering Act, 2002 + PML Rules | Primary AML framework |
| MoF Notification dated 7 March 2023 | Brings VDA service providers within PMLA |
| Unlawful Activities (Prevention) Act, 1967 | Sanctions and proscribed organisations |
| Foreign Exchange Management Act, 1999 | Cross-border activity |
| FATF 40 Recommendations + VASP Guidance | International best practice |
| UN Security Council Resolutions | Financial sanctions |
| Digital Personal Data Protection Act, 2023 | Data collection for KYC |

### A.3 Governance & Accountability

| Role | Responsibility |
|------|---------------|
| **Principal Officer (PO)** | Implementation of this policy; filing STRs and other FIU-IND reports |
| **Designated Director (Board)** | Overall accountability; approves policy annually |
| **Board Risk & Compliance Committee** | Annual and out-of-cycle policy review |
| **Compliance Team** | Day-to-day monitoring, alert triage, EDD reviews |

Contact: compliance@zebvix.com

### A.4 Customer Due Diligence (KYC)

#### KYC Tiers

| Tier | Verification Required | Turnaround | Unlocks |
|------|----------------------|------------|---------|
| **Level 1** | PAN verification (IT-department API) | Instant | Basic spot trading, low withdrawal limits |
| **Level 2** | Aadhaar / OVD + selfie liveness + address proof | ~24 hours | Higher limits, locked Earn, higher leverage |
| **Level 3 (EDD)** | Source of funds, source of wealth, occupation, supporting docs | 2–5 business days | Maximum limits, institutional features |

#### Ongoing CDD
- KYC is reviewed on a periodic risk-based cycle.
- Material changes (address, occupation, source of funds) must be reported by the user promptly.
- Activity inconsistent with the KYC profile triggers re-verification.

### A.5 Enhanced Due Diligence (EDD)

EDD is mandatory for:
- **Politically Exposed Persons (PEPs)** — domestic, foreign, international-organisation PEPs and their close associates and family members.
- Customers with on-chain links to high-risk wallets, mixers, or sanctioned addresses.
- Customers from FATF or GoI-identified higher-risk jurisdictions.
- Customers with unusually large or pattern-inconsistent transactions.

EDD includes: senior-management approval, additional source-of-funds documentation, and more frequent ongoing monitoring.

### A.6 Sanctions Screening

Every user is screened at onboarding and daily against:
- UN Security Council Consolidated Sanctions List
- Schedules to UAPA 1967 and MHA notifications
- OFAC SDN List
- EU Consolidated Sanctions List
- UK HMT Consolidated List
- Domestic and international PEP databases

All crypto-asset deposits and withdrawals are screened in real time against on-chain risk databases (TRM Labs / Chainalysis or equivalent). Funds linked to sanctioned addresses, mixers, dark markets, or known fraud schemes are blocked and escalated to the Principal Officer.

### A.7 Ongoing Transaction Monitoring

Automated monitoring covers fiat and crypto activity. Rules include:

| Rule | Description |
|------|-------------|
| Structuring | Deposits/withdrawals split to stay below thresholds |
| Rapid in-and-out | Funds moved with no economic rationale |
| Profile mismatch | Transactions inconsistent with KYC profile or stated SoF |
| New wallet risk | New or recently funded wallets used immediately on receipt |
| Mixer/tumbler links | Connections to known privacy-coin or mixing services |
| Counterpart concentration | Sudden change in trading pattern or counterpart |

Alerts are triaged by the Compliance team. Confirmed suspicions are escalated to the PO for STR consideration.

### A.8 Regulatory Reporting to FIU-IND

| Report | Trigger |
|--------|---------|
| **STR** (Suspicious Transaction Report) | Reason to believe transaction involves proceeds of crime |
| **CTR** (Cash Transaction Report) | Cash transactions above prescribed threshold |
| **NTR** (NPO Transaction Report) | Transactions involving non-profit organisations |
| **CCR** (Counterfeit Currency Report) | Where applicable |
| **CBWTR** (Cross-Border Wire Transfer Report) | Cross-border wire transfers above threshold |
| **VDA reports** | As prescribed by FIU-IND for Virtual Digital Asset SPs |

Filing an STR is subject to strict **tipping-off** restrictions. Users must not be informed that an STR has been or is being filed.

### A.9 Employee Training

- All employees: AML/CFT induction within 30 days of joining.
- Annual refresher for all staff.
- Enhanced role-specific training for: Compliance, Customer Operations, Risk, Engineering (payment/custody systems).
- Completion tracked and reported to the Board.

### A.10 User Responsibilities

By using Zebvix, users agree to:
1. Provide accurate, current, and complete KYC information.
2. Update KYC profile when material details change.
3. Use the platform only with funds from lawful sources.
4. Not transact on behalf of any undisclosed third party.
5. Cooperate promptly with any EDD request.
6. Not use the Services to facilitate money laundering, sanctions evasion, terrorist financing, fraud, tax evasion, or any other illegal activity.

Non-compliance may result in account restriction, freeze, or termination, with assets returned to the verified source where permitted by law.

### A.11 Cooperation with Authorities

Zebvix cooperates fully with FIU-IND, the Enforcement Directorate, the Income-tax Department, the Reserve Bank of India, courts, and other competent authorities under valid legal process. Accounts and assets may be frozen pursuant to valid legal process without prior notice where notice is restricted by law.

---

## PART B — TRADE POLICY

### B.1 Eligible Users

To trade on Zebvix:
- Must be 18 years or older.
- Must have full legal capacity under the Indian Contract Act, 1872.
- Must not be located in a **Restricted Jurisdiction** (defined in Terms of Service).
- Must not appear on any sanctions, terrorist, or money-laundering watchlist.
- Must not be accessing the platform via VPN to circumvent geographic restrictions.
- Must maintain KYC Level 1 minimum for spot trading; Level 2 for certain higher-risk products.

### B.2 Supported Products

| Product | Status | Min KYC | Leverage |
|---------|--------|---------|----------|
| Spot trading | Live | Level 1 | 1× (no leverage) |
| Perpetual Futures | Live | Level 2 | Up to 50× |
| Options | Live | Level 2 | — |
| P2P Trading | Live | Level 1 | — |
| Instant Convert | Live | Level 1 | — |
| AI Trading Plans | Live | Level 1 | — |
| Trading Bots | Live | Level 1 | — |
| Copy Trading | Live | Level 2 | — |
| Earn / Staking | Live | Level 1 | — |

### B.3 Order Types

| Order Type | Supported | Description |
|-----------|-----------|-------------|
| Limit | ✅ | Buy/sell at a specific price or better |
| Market | ✅ | Execute immediately at best available price (±10% slippage cap) |
| Stop-limit | ✅ | Trigger limit order when stop price reached |
| Post-only | ✅ | Limit order guaranteed to rest in book (no taker fill) |
| Reduce-only | ✅ | Futures: order may only reduce an existing position |

### B.4 Spot Trading Rules

- **Minimum order size**: 0.001 BTC equivalent (per pair — see pair details page).
- **Available balance**: Displayed balance is NET available. Amounts locked in open orders or AI trading subscriptions are already deducted.
- **Fee deduction**: Trading fee deducted from the received asset on fill.
- **Order cancellation**: Any open order may be cancelled at any time; locked balance is released immediately.
- **Self-trade prevention**: Orders from the same user do not match against each other.

### B.5 Futures Trading Rules

- **Leverage**: 1× to 50× (position-size dependent; platform may reduce max leverage during volatility).
- **Margin types**: Cross margin / Isolated margin.
- **Funding rate**: Paid/received every 8 hours between longs and shorts. Rate is market-determined.
- **Liquidation**: Position is liquidated when margin ratio reaches maintenance margin level. Liquidation engine uses mark price (index-based), not last trade price.
- **Auto-deleveraging (ADL)**: Applied if insurance fund is insufficient to cover loss; profitable counter-positions may be partially closed at mark price.
- **Mark price**: Calculated from the weighted average of leading exchange index prices. Prevents price manipulation triggering unjust liquidations.

### B.6 AI Trading Plans

- **Mechanism**: User subscribes to a plan, locking a USDT amount from their spot wallet.
- **Returns**: Simple interest on principal at the plan's APY rate, accrued daily.
- **Principal**: Locked in wallet (`locked` field) for the subscription duration; not available for spot trading.
- **Cancellation**: User may cancel at any time; principal + accrued earnings returned to spot wallet.
- **Risk**: AI trading plans are not guaranteed and returns may vary. Past performance is not indicative of future results.

### B.7 Fee Schedule

#### Spot Trading Fees (Maker/Taker)

| Tier | 30-Day Volume | ZBX Balance | Maker | Taker |
|------|--------------|-------------|-------|-------|
| Regular | < $100K | ≥ 0 | 0.10% | 0.10% |
| VIP 1 | ≥ $100K | ≥ 250 ZBX | 0.090% | 0.100% |
| VIP 2 | ≥ $500K | ≥ 1,000 ZBX | 0.080% | 0.090% |
| VIP 3 | ≥ $2M | ≥ 5,000 ZBX | 0.060% | 0.080% |
| VIP 4 | ≥ $10M | ≥ 25,000 ZBX | 0.040% | 0.060% |
| VIP 5 | ≥ $50M | ≥ 100,000 ZBX | 0.020% | 0.040% |
| VIP 6 | ≥ $250M | Custom | 0.000% | 0.030% |

#### Indian Tax Deducted at Source (TDS) — Section 194S

- **Rate**: 1% on consideration for transfer of Virtual Digital Assets.
- **Threshold**: As prescribed by IT Department (currently ₹10,000 per annum for non-business users; ₹50,000 for specified persons).
- **Applied**: On the sell side of every spot trade above threshold.
- **Certificate**: Annual TDS certificate provided; deducted amounts visible in transaction history.

#### Deposit / Withdrawal Fees

| Type | Fee | Notes |
|------|-----|-------|
| Crypto deposit | 0 | Network gas paid by user at source |
| Crypto withdrawal | Network fee + platform fee | Varies by chain; shown at checkout |
| INR deposit (UPI) | 0 | |
| INR withdrawal (bank transfer) | ₹15–₹25 | Actual NEFT/IMPS cost |

### B.8 Restricted Activities

The following are strictly prohibited:
1. Market manipulation (wash trading, spoofing, layering, quote stuffing).
2. Coordinated pump-and-dump schemes.
3. Use of automated bots not registered through the official Bot API.
4. Trading on behalf of sanctioned persons or entities.
5. Circumventing KYC/AML controls via multiple accounts or proxy use.
6. Exploiting platform bugs or latency arbitrage to the detriment of other users.
7. Any activity that violates applicable law or regulation.

Violations may result in account suspension, cancellation of open orders, asset freeze, and referral to law enforcement.

### B.9 Platform Risk Disclosures (Summary)

Full risk disclosure: `/risk` page on the platform.

| Risk | Description |
|------|-------------|
| Price volatility | Daily 10–30% moves common; total loss possible |
| Leverage | 2% adverse move at 50× = full liquidation |
| Smart contract risk | Listed tokens may have unaudited contracts |
| Custody risk | Hot wallet insured; cold storage protected by access controls |
| Blockchain irreversibility | Wrong-address sends = permanent loss |
| Regulatory risk | Indian and global VDA regulation is evolving |
| Tax | 30% gain tax (115BBH) + 1% TDS (194S) on all VDA transfers |
| Platform availability | 99.99% target; no guarantee during maintenance or force majeure |

### B.10 Dispute Resolution

- **Internal**: Raise a support ticket via `/support` or the in-app chat within 30 days of the disputed event.
- **Escalation**: Unresolved disputes may be escalated to compliance@zebvix.com.
- **Arbitration**: As per Terms of Service — disputes not resolved within 60 days may be referred to arbitration in Bengaluru under the Arbitration and Conciliation Act, 1996.
- **Governing law**: Laws of India. Exclusive jurisdiction: courts of Bengaluru.

---

## PART C — KYC REQUIREMENTS SUMMARY

### C.1 Documents Accepted

| Document Type | Level | Purpose |
|--------------|-------|---------|
| PAN card | Level 1 | Identity verification (mandatory for Indian residents) |
| Aadhaar card | Level 2 | Address + biometric verification |
| Passport | Level 2 | Identity + address (foreign nationals) |
| Voter ID | Level 2 | Address proof |
| Driving licence | Level 2 | Identity + address |
| Bank statement | Level 3 | Source of funds |
| ITR / Form 16 | Level 3 | Source of income |
| Company incorporation docs | Level 3 | Business accounts |

### C.2 KYC Data Retention

- KYC documents are retained for **5 years** from the date of termination of the business relationship, as required by PMLA 2002.
- Data is stored encrypted; access limited to Compliance team and senior management on need-to-know basis.
- Users may request access to their KYC data under DPDP Act 2023 by emailing compliance@zebvix.com.

---

## PART D — RESTRICTED JURISDICTIONS

Access to the Zebvix platform is not available to users located in, or nationals of, the following jurisdictions:

- United States of America
- Iran, North Korea, Myanmar, Cuba, Sudan, Syria
- Any jurisdiction subject to comprehensive UN/OFAC/EU/MHA sanctions
- Any jurisdiction where VDA trading is prohibited by local law

This list is reviewed periodically and updated without prior notice. VPN/proxy use to circumvent geographic restrictions is prohibited.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2024 | Initial compilation |
| 2.0 | October 2024 | Added VDA-specific FIU-IND reporting; updated fee tiers |
| 2.5 | April 2026 | DPDP Act 2023 alignment; updated EDD section; compiled into unified document |

---

*This document is a compilation of Zebvix's public-facing policies. The full internal AML programme — including the Risk Assessment Document, escalation matrix, and training plan — is approved by the Board and not published publicly.*

*For queries: compliance@zebvix.com*
