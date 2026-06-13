---
name: Zebvix admin role gate
description: ADMIN_ROLES gate in admin/App.tsx must match all roles the sidebar and API support; wallet-manager is admin/superadmin only.
---

## Rule
`ADMIN_ROLES` in `artifacts/admin/src/App.tsx` must match the full role set used across the admin sidebar and API.

Current correct value (June 2026):
```ts
const ADMIN_ROLES = ["support", "compliance", "finance", "marketing", "admin", "superadmin"];
```

**Why:** The admin sidebar (`admin-layout.tsx`) defines `type Role = "support" | "finance" | "compliance" | "marketing" | "admin" | "superadmin"` and gates nav items per role. The API's `supportPlus` middleware also allows compliance/finance/marketing. If `ADMIN_ROLES` is narrower, those role-holders get force-logged-out on every visit — silent lockout with no error message.

## Wallet Manager sidebar
`/wallet-manager` sidebar roles must be `["admin", "superadmin"]` only.

**Why:** `admin-wallet-manager.ts` uses `adminAuth = requireRole("admin", "superadmin")`. Showing the link to `finance` users creates a confusing UX where they see the page but every API call returns 403.

## How to apply
When adding new roles to the system (DB user.role values) or new admin pages:
1. Add the role to `ADMIN_ROLES` in `admin/App.tsx`
2. Add the role to `type Role` in `admin-layout.tsx`
3. Ensure the API middleware matches (supportPlus vs adminOnly vs adminAuth)
4. If a page's API is adminOnly, its sidebar roles must also be adminOnly — don't let the sidebar be wider than the API
