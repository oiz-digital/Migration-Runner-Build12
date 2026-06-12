# Zebvix Mobile App — Complete API Reference

> **Base URL (Production):** `https://<your-domain>/api`  
> **Base URL (Dev):** `http://localhost:80/api`  
> **API Version:** REST + WebSocket  
> **Auth:** Session Cookie (`cx_session`) OR JWT Bearer Token

---

## Table of Contents

1. [Authentication & Setup](#1-authentication--setup)
2. [Public Data (No Auth)](#2-public-data-no-auth)
3. [Spot Exchange](#3-spot-exchange)
4. [Futures Trading](#4-futures-trading)
5. [Options Trading](#5-options-trading)
6. [Wallet & Finance](#6-wallet--finance)
7. [INR Payments](#7-inr-payments)
8. [Crypto Deposits & Withdrawals](#8-crypto-deposits--withdrawals)
9. [P2P Trading](#9-p2p-trading)
10. [Convert (Instant Swap)](#10-convert-instant-swap)
11. [AI Trading Plans](#11-ai-trading-plans)
12. [Trading Bots](#12-trading-bots)
13. [Copy Trading](#13-copy-trading)
14. [Earn / Staking](#14-earn--staking)
15. [KYC (Verification)](#15-kyc-verification)
16. [Portfolio Analytics](#16-portfolio-analytics)
17. [Notifications & Price Alerts](#17-notifications--price-alerts)
18. [Security & Account](#18-security--account)
19. [Support Tickets](#19-support-tickets)
20. [Referrals](#20-referrals)
21. [Leaderboard & Leagues](#21-leaderboard--leagues)
22. [Content & Config](#22-content--config)
23. [WebSocket — Real-Time Data](#23-websocket--real-time-data)
24. [Error Codes](#24-error-codes)
25. [Mobile Integration Tips](#25-mobile-integration-tips)

---

## 1. Authentication & Setup

All authenticated endpoints require either:
- **Cookie:** `cx_session` (set automatically on login via browser/WebView)
- **Bearer Token:** `Authorization: Bearer <jwt_token>` (for native mobile apps)

### 1.1 Register

```
POST /api/auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "password": "StrongPass@123",
  "phone": "+919876543210",
  "referralCode": "ZBX1234"
}
```

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": 42,
    "email": "rahul@example.com",
    "name": "Rahul Sharma",
    "kycLevel": 0,
    "role": "user"
  },
  "token": "eyJhbGci..."
}
```

> After register, email OTP verification is needed. Use `/auth/register/verify`.

---

### 1.2 Send OTP (for login or registration)

```
POST /api/auth/challenge/send
Content-Type: application/json
```

**Request Body:**
```json
{
  "target": "rahul@example.com",
  "type": "login"
}
```

`type` options: `login`, `register`, `reset`

---

### 1.3 Verify OTP (Login with OTP)

```
POST /api/auth/login/verify
Content-Type: application/json
```

**Request Body:**
```json
{
  "target": "rahul@example.com",
  "code": "482917"
}
```

**Response:**
```json
{
  "ok": true,
  "token": "eyJhbGci...",
  "user": { "id": 42, "email": "...", "name": "...", "kycLevel": 1 }
}
```

---

### 1.4 Login with Email + Password

```
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "rahul@example.com",
  "password": "StrongPass@123"
}
```

**Response:** Same as OTP verify above.

> If 2FA is enabled, you'll get `{ "requires2fa": true }`. Then POST to `/api/auth/2fa/verify` with the TOTP code.

---

### 1.5 Verify OTP for Registration

```
POST /api/auth/register/verify
Content-Type: application/json

{ "target": "rahul@example.com", "code": "123456" }
```

---

### 1.6 Verify Contact (Email or Phone) After Login

```
POST /api/auth/verify-contact
Authorization: Bearer <token>
Content-Type: application/json

{ "target": "rahul@example.com", "code": "123456", "type": "email" }
```

---

### 1.7 Get Current User

```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 42,
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "phone": "+919876543210",
  "role": "user",
  "kycLevel": 1,
  "vipTier": 0,
  "twoFactorEnabled": false,
  "referralCode": "ZBX1234",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

### 1.8 Logout

```
POST /api/auth/logout
Authorization: Bearer <token>
```

---

### 1.9 Password Reset

```
POST /api/auth/challenge/send
{ "target": "email@example.com", "type": "reset" }

POST /api/auth/login/verify
{ "target": "email@example.com", "code": "123456" }

POST /api/auth/reset-password
Authorization: Bearer <token>
{ "password": "NewPass@123" }
```

---

## 2. Public Data (No Auth)

### 2.1 Health Check

```
GET /api/healthz
```

**Response:** `{ "status": "ok" }`

---

### 2.2 All Coins

```
GET /api/coins
```

**Response:**
```json
[
  { "id": 1, "symbol": "BTC", "name": "Bitcoin", "decimals": 8, "logoUrl": "..." },
  { "id": 2, "symbol": "ETH", "name": "Ethereum", "decimals": 18 }
]
```

---

### 2.3 All Networks/Chains

```
GET /api/networks
```

**Response:**
```json
[
  { "id": 1, "name": "BSC", "chainId": 56, "nativeCoin": "BNB", "explorerUrl": "..." }
]
```

---

### 2.4 All Trading Pairs

```
GET /api/pairs
```

**Response:**
```json
[
  {
    "id": 1,
    "symbol": "BTC/INR",
    "baseCoin": "BTC",
    "quoteCoin": "INR",
    "minQty": "0.0001",
    "maxQty": "100",
    "tickSize": "0.01",
    "status": "active",
    "isFutures": false
  }
]
```

---

### 2.5 Spot Market Prices

```
GET /api/exchange/market
```

**Response:** Array of all pairs with last price, 24h change, volume, high, low.

---

### 2.6 Spot Ticker (single pair)

```
GET /api/exchange/ticker?symbol=BTC/INR
```

---

### 2.7 Orderbook

```
GET /api/orderbook?symbol=BTC/INR&limit=20
```

**Response:**
```json
{
  "bids": [[5324000, 0.5], [5323000, 1.2]],
  "asks": [[5325000, 0.3], [5326000, 0.8]],
  "timestamp": 1700000000000
}
```

---

### 2.8 Recent Trades

```
GET /api/recent-trades?symbol=BTC/INR&limit=50
```

---

### 2.9 OHLCV Candles (Klines)

```
GET /api/klines?symbol=BTC/INR&interval=1h&limit=200
```

`interval` options: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`

**Response:**
```json
[
  { "time": 1700000000, "open": 5300000, "high": 5350000, "low": 5290000, "close": 5324000, "volume": 12.5 }
]
```

---

### 2.10 Exchange Stats

```
GET /api/exchange/stats
```

**Response:**
```json
{
  "totalVolume24h": 146856000000,
  "activePairs": 116,
  "registeredUsers": 209990,
  "trades24h": 18400
}
```

---

### 2.11 Rates (INR/USD conversion)

```
GET /api/rates
```

**Response:** `{ "INR": 83.5, "USD": 1 }`

---

### 2.12 Fee Tiers

```
GET /api/fees/tiers
```

**Response:**
```json
[
  { "tier": 0, "makerFee": "0.10", "takerFee": "0.10", "volumeRequirement": 0 },
  { "tier": 1, "makerFee": "0.08", "takerFee": "0.10", "volumeRequirement": 100000 }
]
```

---

### 2.13 My Fee Tier

```
GET /api/fees/my
Authorization: Bearer <token>
```

---

### 2.14 Fee Quote (before placing order)

```
GET /api/fees/quote?side=buy&symbol=BTC/INR&qty=0.01&type=limit
```

---

### 2.15 Deposit Address

```
GET /api/deposit-address?coin=USDT&network=BSC
Authorization: Bearer <token>
```

**Response:**
```json
{
  "address": "0xAbC123...",
  "memo": null,
  "network": "BSC",
  "coin": "USDT",
  "qrCode": "data:image/png;base64,..."
}
```

---

## 3. Spot Exchange

### 3.1 Place Order

```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "symbol": "BTC/INR",
  "side": "buy",
  "type": "limit",
  "price": 5300000,
  "qty": 0.001,
  "postOnly": false,
  "reduceOnly": false
}
```

`type` options: `limit`, `market`, `stop-limit`  
`side` options: `buy`, `sell`

**Response:**
```json
{
  "id": 1001,
  "symbol": "BTC/INR",
  "side": "buy",
  "type": "limit",
  "price": "5300000",
  "qty": "0.001",
  "filled": "0",
  "status": "open",
  "createdAt": "2025-06-12T00:00:00Z"
}
```

---

### 3.2 Cancel Order

```
POST /api/orders/:id/cancel
Authorization: Bearer <token>
```

---

### 3.3 My Open Orders

```
GET /api/orders?status=open&symbol=BTC/INR
Authorization: Bearer <token>
```

Query params: `status` (open/filled/cancelled/all), `symbol` (optional), `page`, `limit`

---

### 3.4 My Trade History

```
GET /api/trades?symbol=BTC/INR&limit=50
Authorization: Bearer <token>
```

---

### 3.5 Order Fills (for a specific order)

```
GET /api/orders/:id/fills
Authorization: Bearer <token>
```

---

### 3.6 Order Invoice (PDF/JSON)

```
GET /api/orders/:id/invoice
Authorization: Bearer <token>
```

---

## 4. Futures Trading

### 4.1 Futures Markets

```
GET /api/futures/market
```

**Response:** Array of futures pairs with mark price, funding rate, open interest.

---

### 4.2 Futures Orderbook

```
GET /api/futures/orderbook?symbol=BTC/USDT
```

---

### 4.3 Place Futures Order

```
POST /api/futures/orders
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "symbol": "BTC/USDT",
  "side": "buy",
  "type": "limit",
  "price": 67000,
  "qty": 0.01,
  "leverage": 10,
  "marginMode": "isolated",
  "reduceOnly": false
}
```

---

### 4.4 Cancel Futures Order

```
DELETE /api/futures/orders/:id
Authorization: Bearer <token>
```

---

### 4.5 My Futures Orders

```
GET /api/futures/orders?status=open&symbol=BTC/USDT
Authorization: Bearer <token>
```

---

### 4.6 My Futures Positions

```
GET /api/futures/positions?symbol=BTC/USDT
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": 101,
      "symbol": "BTC/USDT",
      "side": "long",
      "qty": "0.01",
      "entryPrice": "67000",
      "markPrice": "67500",
      "leverage": 10,
      "marginMode": "isolated",
      "unrealizedPnl": "5.00",
      "liquidationPrice": "61000",
      "margin": "67.00"
    }
  ]
}
```

---

### 4.7 Close Futures Position

```
POST /api/futures/positions/:id/close
Authorization: Bearer <token>
Content-Type: application/json

{ "qty": 0.01 }
```

---

### 4.8 Set Leverage

```
PATCH /api/futures/positions/:id/leverage
Authorization: Bearer <token>

{ "leverage": 20 }
```

---

### 4.9 Futures Klines

```
GET /api/futures/klines?symbol=BTC/USDT&interval=1h&limit=200
```

---

### 4.10 Open Positions (all)

```
GET /api/positions
Authorization: Bearer <token>
```

---

## 5. Options Trading

### 5.1 List Option Contracts

```
GET /api/options/contracts?baseAsset=BTC&expiry=2025-12-26
```

**Response:**
```json
[
  {
    "symbol": "BTC-26DEC25-70000-C",
    "type": "call",
    "strike": 70000,
    "expiry": "2025-12-26T08:00:00Z",
    "premium": 1250,
    "iv": 0.72,
    "delta": 0.45,
    "openInterest": 150
  }
]
```

---

### 5.2 Option Quote

```
GET /api/options/contracts/:symbol/quote
```

---

### 5.3 Place Option Order

```
POST /api/options/orders
Authorization: Bearer <token>

{
  "symbol": "BTC-26DEC25-70000-C",
  "side": "buy",
  "qty": 1,
  "type": "limit",
  "price": 1200
}
```

---

### 5.4 My Option Positions

```
GET /api/options/positions
Authorization: Bearer <token>
```

---

### 5.5 Close Option Position

```
POST /api/options/positions/:id/close
Authorization: Bearer <token>
```

---

### 5.6 Option Order History

```
GET /api/options/orders/history
Authorization: Bearer <token>
```

---

## 6. Wallet & Finance

### 6.1 All Wallets (Spot Balances)

```
GET /api/wallets
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "coin": "BTC",
    "balance": "0.05230000",
    "locked": "0.00100000",
    "usdValue": 3512.50,
    "inrValue": 293244375
  },
  {
    "coin": "INR",
    "balance": "15000.00",
    "locked": "0.00"
  }
]
```

> **Important:** `balance` = NET available. Do NOT subtract `locked` again — it's already deducted.

---

### 6.2 Ledger (Transaction History)

```
GET /api/ledger?coin=BTC&type=all&page=1&limit=50
Authorization: Bearer <token>
```

`type` options: `deposit`, `withdrawal`, `trade`, `fee`, `transfer`, `earn`, `all`

**Response:**
```json
{
  "data": [
    {
      "id": 5001,
      "coin": "BTC",
      "type": "trade",
      "amount": "0.001",
      "balanceBefore": "0.051",
      "balanceAfter": "0.052",
      "description": "BTC/INR buy fill",
      "createdAt": "2025-06-12T10:00:00Z"
    }
  ],
  "total": 250,
  "page": 1
}
```

---

### 6.3 Ledger Summary

```
GET /api/ledger/summary
Authorization: Bearer <token>
```

**Response:** Total deposits, withdrawals, fees, P&L per coin.

---

### 6.4 Ledger Export (CSV)

```
GET /api/ledger/export?startDate=2025-01-01&endDate=2025-12-31&format=csv
Authorization: Bearer <token>
```

---

### 6.5 Internal Transfer (Spot ↔ Futures)

```
POST /api/transfer
Authorization: Bearer <token>

{
  "coin": "USDT",
  "amount": 100,
  "from": "spot",
  "to": "futures"
}
```

---

### 6.6 Transfer History

```
GET /api/transfers
Authorization: Bearer <token>
```

---

## 7. INR Payments

### 7.1 INR Bank Details (for IMPS deposit)

```
GET /api/payments/inr/bank-details
```

**Response:** Bank name, account number, IFSC, UPI ID for INR deposits.

---

### 7.2 Submit INR Deposit Request

```
POST /api/payments/inr/deposit
Authorization: Bearer <token>

{
  "amount": 10000,
  "utr": "UTR123456789",
  "method": "imps"
}
```

---

### 7.3 Request INR Withdrawal

```
POST /api/payments/inr/withdraw
Authorization: Bearer <token>

{
  "amount": 5000,
  "bankId": 3
}
```

---

### 7.4 INR Transaction History

```
GET /api/payments/inr/history?type=all
Authorization: Bearer <token>
```

---

### 7.5 INR Balance

```
GET /api/payments/inr/balance
Authorization: Bearer <token>
```

---

### 7.6 Razorpay Payment Initiate

```
POST /api/inr-deposits/razorpay/order
Authorization: Bearer <token>

{ "amount": 10000 }
```

**Response:** Razorpay `order_id` to pass to Razorpay SDK.

---

### 7.7 Razorpay Payment Verify

```
POST /api/inr-deposits/razorpay/verify
Authorization: Bearer <token>

{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "sig_xxx"
}
```

---

### 7.8 Saved Bank Accounts

```
GET /api/banks
Authorization: Bearer <token>
```

---

### 7.9 Add Bank Account

```
POST /api/banks
Authorization: Bearer <token>

{
  "accountNumber": "1234567890",
  "ifsc": "HDFC0001234",
  "accountHolderName": "Rahul Sharma",
  "bankName": "HDFC Bank",
  "accountType": "savings"
}
```

---

### 7.10 Update / Delete Bank Account

```
PATCH /api/banks/:id
DELETE /api/banks/:id
Authorization: Bearer <token>
```

---

### 7.11 INR Deposit History

```
GET /api/inr-deposits
Authorization: Bearer <token>
```

---

### 7.12 INR Withdrawal History

```
GET /api/inr-withdrawals
Authorization: Bearer <token>
```

---

### 7.13 Submit INR Withdrawal Request

```
POST /api/inr-withdrawals
Authorization: Bearer <token>

{ "amount": 5000, "bankId": 3 }
```

---

### 7.14 Available Payment Gateways

```
GET /api/gateways
```

**Response:** List of enabled payment gateways (Razorpay, UPI, etc.).

---

## 8. Crypto Deposits & Withdrawals

### 8.1 Crypto Deposit History

```
GET /api/crypto-deposits
Authorization: Bearer <token>
```

---

### 8.2 Notify Crypto Deposit (manual notification)

```
POST /api/crypto-deposits/notify
Authorization: Bearer <token>

{
  "txHash": "0xabc123...",
  "coin": "USDT",
  "network": "BSC",
  "amount": 100
}
```

---

### 8.3 Crypto Withdrawal History

```
GET /api/crypto-withdrawals
Authorization: Bearer <token>
```

---

### 8.4 Submit Crypto Withdrawal

```
POST /api/crypto-withdrawals
Authorization: Bearer <token>

{
  "coin": "USDT",
  "network": "BSC",
  "address": "0xRecipient...",
  "amount": 50,
  "memo": null
}
```

> User must have KYC Level 1 for withdrawals.

---

## 9. P2P Trading

### 9.1 Browse P2P Offers

```
GET /api/p2p/offers?side=sell&coin=USDT&fiat=INR&method=upi&limit=50
```

`side`: `sell` = merchant sells crypto to you (you buy), `buy` = merchant wants to buy

---

### 9.2 Post a P2P Offer (Become Merchant)

```
POST /api/p2p/offers
Authorization: Bearer <token>

{
  "side": "sell",
  "coinSymbol": "USDT",
  "price": 87.5,
  "totalQty": 1000,
  "minFiat": 500,
  "maxFiat": 50000,
  "paymentMethods": ["upi", "imps"],
  "terms": "Pay within 15 minutes."
}
```

---

### 9.3 Update / Delete Offer

```
PATCH /api/p2p/offers/:id
DELETE /api/p2p/offers/:id
Authorization: Bearer <token>
```

---

### 9.4 Get Seller Payment Methods (before opening order)

```
GET /api/p2p/offers/:id/seller-methods
Authorization: Bearer <token>
```

---

### 9.5 Open P2P Order

```
POST /api/p2p/orders
Authorization: Bearer <token>

{
  "offerId": 42,
  "qty": 100,
  "sellerMethodId": 5
}
```

---

### 9.6 Mark P2P Order Paid (Buyer)

```
POST /api/p2p/orders/:id/mark-paid
Authorization: Bearer <token>

{ "utr": "UTR123456789" }
```

---

### 9.7 Release P2P Escrow (Seller)

```
POST /api/p2p/orders/:id/release
Authorization: Bearer <token>
```

---

### 9.8 Cancel P2P Order

```
POST /api/p2p/orders/:id/cancel
Authorization: Bearer <token>
```

---

### 9.9 Open Dispute

```
POST /api/p2p/orders/:id/dispute
Authorization: Bearer <token>

{ "reason": "Seller not releasing after payment confirmed." }
```

---

### 9.10 P2P Chat

```
GET  /api/p2p/orders/:id/messages    — list chat messages
POST /api/p2p/orders/:id/messages    — send message
Authorization: Bearer <token>

POST body: { "message": "Hello, I have sent the payment." }
```

---

### 9.11 My P2P Orders

```
GET /api/p2p/orders?role=all&status=all
Authorization: Bearer <token>
```

---

### 9.12 P2P Payment Methods (saved UPI/bank)

```
GET  /api/p2p/payment-methods
POST /api/p2p/payment-methods
DELETE /api/p2p/payment-methods/:id
Authorization: Bearer <token>
```

**POST body:**
```json
{
  "method": "upi",
  "label": "My UPI",
  "account": "rahul@okicici",
  "ifsc": null,
  "holderName": null
}
```

`method` options: `upi`, `imps`, `neft`, `bank`, `paytm`, `phonepe`, `gpay`

---

## 10. Convert (Instant Swap)

### 10.1 Get Conversion Quote

```
POST /api/convert/quote
Authorization: Bearer <token>

{
  "fromCoin": "INR",
  "toCoin": "USDT",
  "amount": 1000,
  "side": "from"
}
```

**Response:**
```json
{
  "fromAmount": 1000,
  "toAmount": 11.49,
  "rate": 87.04,
  "fee": 0.1,
  "expiresAt": "2025-06-12T10:05:00Z",
  "quoteId": "q_abc123"
}
```

---

### 10.2 Execute Conversion

```
POST /api/convert/execute
Authorization: Bearer <token>

{ "quoteId": "q_abc123" }
```

---

### 10.3 Conversion History

```
GET /api/convert/history?limit=50
Authorization: Bearer <token>
```

---

## 11. AI Trading Plans

### 11.1 List Available AI Plans

```
GET /api/ai-trading/plans
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Starter Plan",
    "minDeposit": 1000,
    "maxDeposit": 10000,
    "dailyReturn": 0.5,
    "durationDays": 30,
    "coin": "USDT",
    "status": "active"
  }
]
```

---

### 11.2 Subscribe to AI Plan

```
POST /api/ai-trading/subscribe
Authorization: Bearer <token>

{
  "planId": 1,
  "amount": 5000,
  "coin": "USDT"
}
```

---

### 11.3 My AI Trading Subscriptions

```
GET /api/ai-trading/subscriptions
Authorization: Bearer <token>
```

---

### 11.4 AI Trading Earnings

```
GET /api/ai-trading/earnings?subscriptionId=5
Authorization: Bearer <token>
```

---

### 11.5 Cancel AI Trading Subscription

```
POST /api/ai-trading/subscriptions/:id/cancel
Authorization: Bearer <token>
```

---

### 11.6 AI Subscription Invoice

```
GET /api/ai-trading/subscriptions/:id/invoice
Authorization: Bearer <token>
```

---

## 12. Trading Bots

### 12.1 List My Bots

```
GET /api/bots
Authorization: Bearer <token>
```

---

### 12.2 Create Bot

```
POST /api/bots
Authorization: Bearer <token>

{
  "name": "BTC Grid Bot",
  "symbol": "BTC/INR",
  "type": "grid",
  "config": {
    "lowerPrice": 5000000,
    "upperPrice": 5500000,
    "gridCount": 10,
    "perGridAmount": 5000,
    "coin": "INR"
  }
}
```

`type` options: `grid`, `dca`, `martingale`

---

### 12.3 Start / Stop Bot

```
POST /api/bots/:id/start
POST /api/bots/:id/stop
Authorization: Bearer <token>
```

---

### 12.4 Delete Bot

```
DELETE /api/bots/:id
Authorization: Bearer <token>
```

---

### 12.5 Bot Details

```
GET /api/bots/:id
Authorization: Bearer <token>
```

---

## 13. Copy Trading

### 13.1 Leaderboard

```
GET /api/copy/leaderboard?sortBy=pnl30d&limit=50
```

**Response:**
```json
[
  {
    "id": 5,
    "displayName": "CryptoMaster",
    "handle": "@cryptomaster",
    "pnl30d": 12.5,
    "roi": 28.4,
    "followers": 234,
    "copiers": 89,
    "riskScore": 3,
    "verified": true
  }
]
```

---

### 13.2 Trader Profile

```
GET /api/copy/traders/:id
```

---

### 13.3 Follow a Trader (Start Copying)

```
POST /api/copy/follow
Authorization: Bearer <token>

{
  "traderId": 5,
  "copyAmount": 10000,
  "maxLoss": 20,
  "coin": "USDT"
}
```

---

### 13.4 My Following List

```
GET /api/copy/me/following
Authorization: Bearer <token>
```

---

### 13.5 Update Copy Settings

```
PATCH /api/copy/relations/:id
Authorization: Bearer <token>

{ "copyAmount": 15000, "maxLoss": 25 }
```

---

### 13.6 Stop Copying

```
POST /api/copy/relations/:id/stop
Authorization: Bearer <token>
```

---

### 13.7 Become a Copy Trader

```
POST /api/copy/become-trader
Authorization: Bearer <token>

{
  "displayName": "CryptoMaster",
  "bio": "10 years trading experience.",
  "minCopyAmount": 1000
}
```

---

### 13.8 My Followers

```
GET /api/copy/me/followers
Authorization: Bearer <token>
```

---

## 14. Earn / Staking

### 14.1 List Earn Products

```
GET /api/earn/products
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "USDT Flexible",
    "coin": "USDT",
    "type": "flexible",
    "apy": 8.5,
    "minAmount": 10,
    "maxAmount": 100000,
    "lockDays": 0,
    "status": "active"
  },
  {
    "id": 2,
    "name": "BTC 30-Day Fixed",
    "coin": "BTC",
    "type": "fixed",
    "apy": 12,
    "lockDays": 30
  }
]
```

---

### 14.2 Subscribe to Earn Product

```
POST /api/earn/subscribe
Authorization: Bearer <token>

{
  "productId": 1,
  "amount": 1000,
  "autoRenew": true
}
```

---

### 14.3 My Earn Positions

```
GET /api/earn/positions
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": 10,
    "product": { "name": "USDT Flexible", "apy": 8.5 },
    "amount": "1000",
    "earnedSoFar": "2.34",
    "startedAt": "2025-06-01T00:00:00Z",
    "status": "active"
  }
]
```

---

### 14.4 Redeem Earn Position

```
POST /api/earn/positions/:id/redeem
Authorization: Bearer <token>

{ "amount": 500 }
```

---

### 14.5 Earn Summary

```
GET /api/earn/summary
Authorization: Bearer <token>
```

**Response:**
```json
{
  "totalLockedUsd": 1150.45,
  "totalEarningsUsd": 12.34,
  "activePositions": 2
}
```

---

## 15. KYC (Verification)

### 15.1 KYC Settings / Requirements

```
GET /api/kyc/settings
```

**Response:** KYC level requirements, document types, limits per level.

---

### 15.2 My KYC Status

```
GET /api/kyc/my
Authorization: Bearer <token>
```

**Response:**
```json
{
  "currentLevel": 1,
  "submissions": [
    {
      "id": 7,
      "level": 1,
      "status": "approved",
      "documentType": "pan",
      "submittedAt": "2025-05-01T00:00:00Z",
      "reviewedAt": "2025-05-02T00:00:00Z"
    }
  ]
}
```

`status` options: `pending`, `approved`, `rejected`, `needs_resubmission`

---

### 15.3 Submit KYC Documents

```
POST /api/kyc/submit
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Fields:**
```
level: 1
documentType: pan
panNumber: ABCDE1234F
fullName: Rahul Sharma
dob: 1990-01-15
frontImage: <file>
selfie: <file>
```

For Level 2: add `aadhaarNumber`, `aadhaarFront`, `aadhaarBack`

---

## 16. Portfolio Analytics

### 16.1 Portfolio Summary

```
GET /api/portfolio/analytics/summary
Authorization: Bearer <token>
```

**Response:**
```json
{
  "totalValueInr": 125000,
  "totalValueUsdt": 1497.5,
  "change24h": 2.3,
  "change7d": -1.2,
  "pnlAllTime": 15200,
  "holdings": [
    { "coin": "BTC", "qty": "0.05", "avgBuyPrice": 5200000, "currentPrice": 5324000, "pnl": 620, "pnlPct": 2.38 }
  ]
}
```

---

### 16.2 Portfolio History (for chart)

```
GET /api/portfolio/analytics/history?period=30d
Authorization: Bearer <token>
```

**Response:** Array of `{ date, valueInr, valueUsdt }` for the selected period.

`period` options: `7d`, `30d`, `90d`, `1y`, `all`

---

### 16.3 Tax Report

```
GET /api/portfolio/analytics/tax-report?year=2025
Authorization: Bearer <token>
```

---

## 17. Notifications & Price Alerts

### 17.1 My Notifications

```
GET /api/notifications/me?unread=true&limit=50
Authorization: Bearer <token>
```

---

### 17.2 Unread Count

```
GET /api/notifications/me/unread-count
Authorization: Bearer <token>
```

**Response:** `{ "count": 3 }`

---

### 17.3 Mark All as Read

```
POST /api/notifications/me/read-all
Authorization: Bearer <token>
```

---

### 17.4 Mark Single Notification as Read

```
POST /api/notifications/me/:id/read
Authorization: Bearer <token>
```

---

### 17.5 Delete Notification

```
DELETE /api/notifications/me/:id
Authorization: Bearer <token>
```

---

### 17.6 Price Alerts

```
GET  /api/price-alerts          — list my alerts
POST /api/price-alerts          — create alert
PATCH /api/price-alerts/:id/disable  — disable alert
DELETE /api/price-alerts/:id    — delete alert
Authorization: Bearer <token>
```

**POST body:**
```json
{
  "symbol": "BTC/INR",
  "condition": "above",
  "price": 5500000,
  "notify": ["push", "email"]
}
```

`condition` options: `above`, `below`

---

### 17.7 Register Push Token (FCM for mobile)

```
POST /api/push/register-token
Authorization: Bearer <token>

{
  "token": "fcm_device_token_here",
  "platform": "android"
}
```

`platform` options: `android`, `ios`

---

### 17.8 Unregister Push Token

```
DELETE /api/push/register-token
Authorization: Bearer <token>

{ "token": "fcm_device_token_here" }
```

---

## 18. Security & Account

### 18.1 My Security Settings

```
GET /api/security/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "twoFactorEnabled": false,
  "totpSetupUri": null,
  "activeSessions": 2,
  "lastLogin": "2025-06-12T08:00:00Z",
  "loginNotifications": true
}
```

---

### 18.2 Enable 2FA (TOTP)

```
POST /api/security/2fa/enable
Authorization: Bearer <token>

{ "code": "123456" }
```

> First call without code returns `{ "setupUri": "otpauth://totp/...", "qrCode": "data:image/png..." }`.  
> Second call with code confirms setup.

---

### 18.3 Disable 2FA

```
POST /api/security/2fa/disable
Authorization: Bearer <token>

{ "code": "123456", "password": "yourPassword" }
```

---

### 18.4 Update Login Preferences

```
PATCH /api/security/login-prefs
Authorization: Bearer <token>

{ "loginNotifications": true, "withdrawalWhitelist": false }
```

---

### 18.5 Revoke Other Sessions

```
POST /api/security/sessions/revoke-others
Authorization: Bearer <token>
```

---

### 18.6 API Keys (for algo trading)

```
GET    /api/account/api-keys         — list my API keys
POST   /api/account/api-keys         — create new key
PATCH  /api/account/api-keys/:id     — update permissions
POST   /api/account/api-keys/:id/disable
POST   /api/account/api-keys/:id/enable
DELETE /api/account/api-keys/:id
Authorization: Bearer <token>
```

**POST body:**
```json
{
  "label": "My Trading Bot",
  "permissions": ["read", "trade"],
  "ipWhitelist": ["1.2.3.4"]
}
```

---

## 19. Support Tickets

### 19.1 List My Tickets

```
GET /api/support/tickets?status=open
Authorization: Bearer <token>
```

---

### 19.2 Create Ticket

```
POST /api/support/tickets
Authorization: Bearer <token>

{
  "subject": "Withdrawal not processed",
  "category": "withdrawal",
  "message": "I submitted a withdrawal 24 hours ago and it is still pending."
}
```

---

### 19.3 Get Ticket Details + Messages

```
GET /api/support/tickets/:id
Authorization: Bearer <token>
```

---

### 19.4 Reply to Ticket

```
POST /api/support/tickets/:id/messages
Authorization: Bearer <token>

{ "message": "I have attached the transaction ID: TXN123456" }
```

---

### 19.5 Close Ticket

```
PATCH /api/support/tickets/:id/close
Authorization: Bearer <token>
```

---

## 20. Referrals

### 20.1 Referral Stats

```
GET /api/refer/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "referralCode": "ZBX1234",
  "referralLink": "https://zebvix.com/signup?ref=ZBX1234",
  "totalReferrals": 12,
  "totalEarnings": 1250,
  "pendingEarnings": 150,
  "referrals": [
    {
      "name": "Amit K.",
      "joinedAt": "2025-05-15T00:00:00Z",
      "kycVerified": true,
      "earnings": 100
    }
  ]
}
```

---

### 20.2 Referral History

```
GET /api/referrals
Authorization: Bearer <token>
```

---

## 21. Leaderboard & Leagues

### 21.1 Trading Leagues List

```
GET /api/leagues
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "June Champions League",
    "startDate": "2025-06-01",
    "endDate": "2025-06-30",
    "prizePool": 500000,
    "currency": "INR",
    "status": "active",
    "participants": 3421
  }
]
```

---

### 21.2 League Leaderboard

```
GET /api/leagues/:id/leaderboard?limit=100
```

---

### 21.3 My Rank in League

```
GET /api/leagues/:id/my-rank
Authorization: Bearer <token>
```

---

## 22. Content & Config

### 22.1 Site Config (branding, features, geo rules)

```
GET /api/content/site-config
```

**Response:**
```json
{
  "siteName": "Zebvix",
  "tagline": "India's Premium Crypto Exchange",
  "logoUrl": "...",
  "features": {
    "p2p": true,
    "futures": true,
    "options": true,
    "earn": true
  },
  "geo": {
    "mode": "blocklist",
    "countries": ["RU", "KP", "IR"]
  }
}
```

---

### 22.2 Announcements / News

```
GET /api/content/announcements?limit=10
GET /api/content/news?limit=10&category=exchange
GET /api/content/news/:slug
```

---

### 22.3 Competitions

```
GET /api/content/competitions
```

---

### 22.4 Platform Notifications (banners)

```
GET /api/content/notifications
Authorization: Bearer <token>   (optional — personalized if logged in)
```

---

### 22.5 Banners & Promotions

```
GET /api/content/banners
GET /api/content/promotions
```

---

### 22.6 Legal Pages

```
GET /api/legal/terms
GET /api/legal/privacy
GET /api/legal/aml
GET /api/legal/risk
GET /api/legal/cookies
GET /api/legal/fees
```

---

### 22.7 Public Settings

```
GET /api/settings
GET /api/settings/:key
```

---

## 23. WebSocket — Real-Time Data

**WebSocket URL:**

```
ws://<your-domain>/api/ws/prices
```

Also supported (aliases):
- `wss://<domain>/api/exchange/ws`
- `wss://<domain>/api/exchange/market`
- `wss://<domain>/api/futures/ws`

---

### 23.1 Connection & Subscription

After connecting, send subscription messages:

```json
{
  "action": "SUBSCRIBE",
  "payload": {
    "type": "ticker",
    "symbol": "BTC/INR"
  }
}
```

`type` options: `ticker`, `orderbook`, `trades`, `ohlcv`

---

### 23.2 Subscribe to Orderbook

```json
{
  "action": "SUBSCRIBE",
  "payload": {
    "type": "orderbook",
    "symbol": "BTC/INR",
    "limit": 20
  }
}
```

**Server pushes:**
```json
{
  "stream": "orderbook:BTC/INR",
  "data": {
    "bids": [[5324000, 0.5], [5323000, 1.2]],
    "asks": [[5325000, 0.3]],
    "symbol": "BTC/INR",
    "timestamp": 1700000000000
  }
}
```

---

### 23.3 Subscribe to Trades Feed

```json
{
  "action": "SUBSCRIBE",
  "payload": { "type": "trades", "symbol": "BTC/INR" }
}
```

**Server pushes:**
```json
{
  "stream": "trades:BTC/INR",
  "symbol": "BTC/INR",
  "data": [
    { "price": 5324000, "qty": 0.001, "side": "buy", "time": 1700000000000 }
  ]
}
```

---

### 23.4 Subscribe to OHLCV (Live Candles)

```json
{
  "action": "SUBSCRIBE",
  "payload": {
    "type": "ohlcv",
    "symbol": "BTC/INR",
    "interval": "1m"
  }
}
```

`interval` options: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`

**Server pushes:**
```json
{
  "stream": "ohlcv:BTC/INR:1m",
  "data": [
    { "time": 1700000000, "open": 5320000, "high": 5330000, "low": 5315000, "close": 5324000, "volume": 2.3 }
  ]
}
```

---

### 23.5 All-Market Ticker (push every 1s)

The server automatically pushes all-market tickers without subscription:

```json
{
  "type": "tickers",
  "data": {
    "BTC/INR": { "last": 5324000, "change": 0.77, "baseVolume": 1.14, "high": 5363000, "low": 5324000 },
    "ETH/INR": { "last": 140423, "change": 0.53, "baseVolume": 8.2 }
  }
}
```

---

### 23.6 Unsubscribe

```json
{
  "action": "UNSUBSCRIBE",
  "payload": { "type": "orderbook", "symbol": "BTC/INR" }
}
```

---

### 23.7 Keepalive (Ping/Pong)

Send ping every 30 seconds:

```json
{ "action": "ping" }
```

Server responds:
```json
{ "action": "pong", "timestamp": 1700000000000 }
```

---

## 24. Error Codes

All errors return:

```json
{
  "error": "INSUFFICIENT_BALANCE",
  "message": "Insufficient balance to place this order.",
  "statusCode": 400
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `400` | Bad request / validation error |
| `401` | Unauthorized — login required |
| `403` | Forbidden — insufficient permissions / KYC level |
| `404` | Resource not found |
| `409` | Conflict (duplicate, already exists) |
| `429` | Rate limit exceeded |
| `500` | Server error |

**Common Error Codes:**

| Code | Description |
|------|-------------|
| `INVALID_CREDENTIALS` | Wrong email or password |
| `OTP_EXPIRED` | OTP has expired, request a new one |
| `OTP_INVALID` | Incorrect OTP |
| `INSUFFICIENT_BALANCE` | Not enough wallet balance |
| `KYC_REQUIRED` | Action requires KYC Level 1 or higher |
| `ORDER_NOT_FOUND` | Order ID does not exist |
| `RATE_LIMIT_EXCEEDED` | Too many requests — wait and retry |
| `PAIR_DISABLED` | Trading pair is not active |
| `BELOW_MIN_ORDER` | Order amount below minimum |
| `ABOVE_MAX_ORDER` | Order amount above maximum |
| `2FA_REQUIRED` | 2FA code needed |
| `GEO_BLOCKED` | Access not available in your country |

---

## 25. Mobile Integration Tips

### 25.1 Authentication Strategy (Recommended for Mobile)

```dart
// Flutter example
final response = await http.post(
  Uri.parse('https://zebvix.com/api/auth/login'),
  headers: { 'Content-Type': 'application/json' },
  body: jsonEncode({ 'email': email, 'password': password }),
);
final data = jsonDecode(response.body);
final token = data['token'];

// Store token securely
await secureStorage.write(key: 'jwt_token', value: token);

// Use in subsequent requests
final walletResp = await http.get(
  Uri.parse('https://zebvix.com/api/wallets'),
  headers: { 'Authorization': 'Bearer $token' },
);
```

---

### 25.2 WebSocket Integration (Flutter)

```dart
import 'package:web_socket_channel/web_socket_channel.dart';

final channel = WebSocketChannel.connect(
  Uri.parse('wss://zebvix.com/api/ws/prices'),
);

// Subscribe to orderbook
channel.sink.add(jsonEncode({
  'action': 'SUBSCRIBE',
  'payload': { 'type': 'orderbook', 'symbol': 'BTC/INR', 'limit': 20 }
}));

// Listen for updates
channel.stream.listen((message) {
  final data = jsonDecode(message);
  if (data['stream'] == 'orderbook:BTC/INR') {
    final bids = data['data']['bids'];
    final asks = data['data']['asks'];
    // Update UI
  }
});

// Keepalive ping every 30s
Timer.periodic(Duration(seconds: 30), (_) {
  channel.sink.add(jsonEncode({ 'action': 'ping' }));
});
```

---

### 25.3 KYC Level Gates

| Feature | Min KYC Level |
|---------|---------------|
| View markets / prices | None |
| Spot trading | 0 (but limited) |
| INR deposits | 1 (PAN verified) |
| INR withdrawals | 1 |
| Crypto withdrawals | 1 |
| Futures trading | 1 |
| P2P trading | 1 |
| Higher limits | 2 (Aadhaar + selfie) |

---

### 25.4 Rate Limits

| Endpoint Group | Limit |
|----------------|-------|
| Global (all requests) | 100 requests / 15 minutes per IP |
| Auth (login/register) | 10 requests / 15 minutes per IP |
| OTP requests | 5 requests / hour per IP |
| Order placement | 2 orders / second per session |

---

### 25.5 Pagination

Most list endpoints support:
```
?page=1&limit=50
```

Response includes:
```json
{ "data": [...], "total": 250, "page": 1, "limit": 50, "totalPages": 5 }
```

---

### 25.6 Push Notifications Setup (FCM)

1. Register FCM token after login: `POST /api/push/register-token`
2. Server sends push for: order fills, deposits credited, withdrawal processed, price alerts, P2P order updates, KYC status changes
3. Unregister on logout: `DELETE /api/push/register-token`

---

### 25.7 Referral Deep Link

Referral signup link format:
```
https://zebvix.com/signup?ref=ZBX1234
```

Also supported: `?referral=ZBX1234` and `?referralCode=ZBX1234`

For mobile deep links, handle the `ref` parameter and store it before registration.

---

### 25.8 V1 API (for Algorithmic Trading / API Key Auth)

For programmatic trading using API keys (not session/JWT):

```
GET  /api/v1/system/time
GET  /api/v1/account/me
GET  /api/v1/account/balances
```

Pass API key in header:
```
X-API-Key: your_api_key_here
X-API-Secret: your_api_secret_here
```

---

*Generated: June 2026 | Zebvix Exchange API v1.0*
