# Billing and credits

## What exists
Credits balance, usage and top-up UI at `/settings/credits`, billing and cost-usage
settings, and the managed-credits success page at `/managed-credits/success`. Billing is
open source; Cloud-only behavior is a runtime gate (`hasOrganizationBilling()`), not a
separate tree.

## How a user reaches it
Settings → Credits / Billing, or the credits indicator in the shell.

## How to drive it
Community (default) specs: `playwright/e2e/tests/settings/billing.spec.ts` (asserts zero
credit reads on Community), `settings/cost-usage.spec.ts`.
Cloud specs: `playwright/e2e/tests/cloud/` (`billing-credits`, `credits-recovery`,
`google-sign-in`) — these need `NEXT_PUBLIC_GENFEED_E2E_DEPLOYMENT=cloud` set on the app
and the test run. Desktop credits: `studio/desktop-credits-runtime.spec.ts`.

## What usually breaks
- A cloud spec run against a Community app (or the reverse) fails by design; match the
  deployment flag on both sides.
- Credit reads are gated by `hasOrganizationBillingHint()`; the Community lane asserts
  they never fire.
- Never exercise real payments. Stripe flows are mocked; use test mode only on a
  local or staging stack you own.
