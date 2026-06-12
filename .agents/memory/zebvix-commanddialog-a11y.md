---
name: Zebvix CommandDialog accessibility
description: How to fix DialogContent accessibility warnings in user-portal and admin command.tsx
---

The `CommandDialog` in both `artifacts/user-portal/src/components/ui/command.tsx` and `artifacts/admin/src/components/ui/command.tsx` wraps a Radix `DialogContent` without a visible title. This triggers a Radix accessibility warning.

**Fix:** Add `<DialogTitle className="sr-only">` and `<DialogDescription className="sr-only">` directly inside `<DialogContent>`, before the `<Command>` element.

**Why:** `@radix-ui/react-visually-hidden` is NOT installed in the workspace — using it causes a Vite import error. The `className="sr-only"` Tailwind approach achieves the same screen-reader accessibility without an extra package.

**How to apply:** If the warning reappears after any update to command.tsx, import `DialogTitle` and `DialogDescription` from `@/components/ui/dialog` and add them as sr-only elements at the top of the DialogContent.
