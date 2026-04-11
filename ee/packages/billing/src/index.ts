/**
 * @genfeedai/ee-billing — Phase C Layer 1 scaffold.
 *
 * This package is the target for the enterprise billing extraction tracked in
 * issue #87 and documented in `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b.
 *
 * **What's here today (Layer 1):**
 * Re-exports of the OSS-core service contracts from `@genfeedai/interfaces/billing`.
 * These contracts describe the surface OSS code calls; the concrete
 * implementations still live in `apps/server/api/src/collections/credits/`
 * and `apps/server/api/src/collections/subscriptions/`.
 *
 * **What Layer 2 will move here:**
 * - `apps/server/api/src/collections/credits/` → `./src/credits/`
 * - `apps/server/api/src/collections/subscriptions/` → `./src/subscriptions/`
 * - `apps/server/api/src/collections/user-subscriptions/` → `./src/user-subscriptions/`
 * - `apps/server/api/src/collections/subscription-attributions/` → `./src/subscription-attributions/`
 * - `apps/server/api/src/services/byok-billing/` → `./src/byok-billing/`
 * - `apps/server/api/src/services/integrations/stripe/` → `./src/integrations/stripe/`
 * - `apps/server/api/src/endpoints/webhooks/stripe/` → `./src/webhooks/stripe/`
 *
 * See `./EE-EXTRACTION.md` for the full move plan and sequencing.
 */

export type {
  ICreditsUtilsService,
  ISubscriptionFindOneFilter,
  ISubscriptionsService,
} from '@genfeedai/interfaces/billing';
