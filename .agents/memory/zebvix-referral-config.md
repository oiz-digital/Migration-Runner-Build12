---
name: Zebvix referral config architecture
description: How referral commission config is stored, read, and admin-configured; critical two-table distinction
---

## Rule
All referral commission config lives in `settingsTable` under key `"referral.config"` (JSON). Engines **only** read from `settingsTable`. The `exchangeSettingsTable` is a separate table used by generic exchange-settings UI — never mix them for referral config.

**Why:** Before this fix, `exchange-settings.tsx` saved referral AI rates to `exchangeSettingsTable` while engines read from `settingsTable` — admin changes had zero effect. Similarly, `settings.tsx` had a `referral.commission` single-value field in `settingsTable` but no engine read it.

## Config structure
```json
{
  "enabled": true,
  "registrationBonus": 1.0,
  "trading": { "1": 30, "2": 15, "3": 8, "4": 4, "5": 2 },
  "ai":      { "1": 5,  "2": 3,  "3": 2, "4": 1, "5": 0.5 },
  "earn":    { "1": 3,  "2": 2,  "3": 1, "4": 0.5, "5": 0.25 }
}
```

## Key files
- `admin-referrals.ts` — exports `loadReferralConfig()`, `DEFAULT_REFERRAL_CONFIG`, `REFERRAL_CONFIG_KEY`; adds `GET/PUT /api/admin/referral-settings`
- `trading-fee-referral.ts` — imports `loadReferralConfig` from admin-referrals; checks `enabled` flag; uses `trading` rates for spot/futures, `earn` rates for earn_plan
- `ai-credit-engine.ts` — imports both `loadReferralConfig` and `creditReferralChain`; uses `ai` rates
- `exchange-settings.tsx` — has `ReferralSettingsSection` component (custom, calls `/admin/referral-settings`); removed broken SECTIONS entry
- `settings.tsx` — `referral.commission` key removed from FEE_KEYS (was meaningless)

## How to apply
Any time you add a new commission type (e.g. options, copy-trading), add it to the `ReferralConfig` interface in `admin-referrals.ts`, add a default in `DEFAULT_REFERRAL_CONFIG`, and call `creditReferralChain()` with `config.<type>` rates. Do NOT hardcode rates in engines.
