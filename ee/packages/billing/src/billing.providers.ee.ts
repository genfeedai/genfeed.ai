/**
 * EE billing DI fragments — the enterprise (SaaS) flavor of `@billing-providers`.
 *
 * Resolved by the `@billing-providers` flavor resolver plugin in
 * webpack.base.config.js whenever `ee/packages/billing` is present in the
 * build (the `Dockerfile.server` SaaS image). The three api billing collection
 * modules compose their `@Module()` metadata directly from the matching
 * fragment here, so the EE controllers and services register exactly as they
 * did before the decouple. Resolution must NOT rely on `resolve.alias` or the
 * tsconfig paths mapping: the tsconfig pins `@billing-providers` to the OSS
 * stub for tsc, and TsconfigPathsPlugin outranks the alias — which shipped
 * OSS-stub billing inside the SaaS image until #2751. Guards:
 * `bun run check:billing-flavor` + the Dockerfile.server bundle gate.
 *
 * Two-layer gating:
 *   1. Build-time — the flavor resolver points `@billing-providers` at THIS
 *      file only when `ee/packages/billing/src` exists on disk. The community
 *      image never sees it; it gets `billing.providers.oss.ts` instead.
 *   2. Runtime — `hasOrganizationBilling()` (SaaS via `GENFEED_CLOUD` **or**
 *      self-host license / signature) decides what the shared string token
 *      resolves to. The real EE service class is ALWAYS registered as a provider
 *      so the EE controllers (which inject the class token directly) keep
 *      working; the string token that the rest of the api tree injects points at
 *      the real service when org billing is live, or the OSS no-op stub when not.
 *      Do not gate Cloud SaaS on license key alone — hosted has no license key.
 *
 * The OSS counterpart lives at
 * `apps/server/api/src/common/subscriptions/billing.providers.oss.ts` and must
 * keep the same three named exports with the same fragment shape.
 */

import type { BillingProviderFragment } from '@api/common/subscriptions/billing.providers.oss';
import { OssSubscriptionAttributionsService } from '@api/common/subscriptions/oss-subscription-attributions.service';
import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { OssUserSubscriptionsService } from '@api/common/subscriptions/oss-user-subscriptions.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { SubscriptionAttributionsController } from './subscription-attributions/controllers/subscription-attributions.controller';
import { SubscriptionAttributionsService } from './subscription-attributions/services/subscription-attributions.service';
import { SubscriptionsController } from './subscriptions/controllers/subscriptions.controller';
import { SubscriptionsService } from './subscriptions/services/subscriptions.service';
import { UserSubscriptionsService } from './user-subscriptions/services/user-subscriptions.service';

/**
 * SaaS (GENFEED_CLOUD / hosted api.genfeed.ai) or licensed EE self-host.
 *
 * The community image never loads this file — it uses
 * `billing.providers.oss.ts`. Hosted Cloud is detected from its explicit flag or
 * `*.genfeed.ai` public URL, while unlicensed self-hosted EE builds stay on the
 * OSS services.
 */
function isOrgBillingLive(): boolean {
  return hasOrganizationBilling();
}

function subscriptionsServiceProvider() {
  return isOrgBillingLive()
    ? { provide: SUBSCRIPTIONS_SERVICE, useExisting: SubscriptionsService }
    : { provide: SUBSCRIPTIONS_SERVICE, useClass: OssSubscriptionsService };
}

function userSubscriptionsServiceProvider() {
  return isOrgBillingLive()
    ? {
        provide: USER_SUBSCRIPTIONS_SERVICE,
        useExisting: UserSubscriptionsService,
      }
    : {
        provide: USER_SUBSCRIPTIONS_SERVICE,
        useClass: OssUserSubscriptionsService,
      };
}

function subscriptionAttributionsServiceProvider() {
  return isOrgBillingLive()
    ? {
        provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
        useExisting: SubscriptionAttributionsService,
      }
    : {
        provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
        useClass: OssSubscriptionAttributionsService,
      };
}

export const subscriptions: BillingProviderFragment = {
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService, SUBSCRIPTIONS_SERVICE],
  // Nest module imports live on the api wrapper
  // (`apps/server/api/src/collections/subscriptions/subscriptions.module.ts`).
  // That wrapper imports `StripeCoreModule`, not `StripeModule`, so billing
  // can use the Stripe client without closing a Subscriptions ring.
  // A webpack-visible `require()` of api modules here re-enters this file
  // before `userSubscriptions` is assigned and crashes SaaS workers
  // (API-GENFEED-AI-60).
  imports: [],
  providers: [SubscriptionsService, subscriptionsServiceProvider()],
};

export const userSubscriptions: BillingProviderFragment = {
  controllers: [],
  exports: [UserSubscriptionsService, USER_SUBSCRIPTIONS_SERVICE],
  imports: [],
  providers: [UserSubscriptionsService, userSubscriptionsServiceProvider()],
};

export const subscriptionAttributions: BillingProviderFragment = {
  controllers: [SubscriptionAttributionsController],
  exports: [SubscriptionAttributionsService, SUBSCRIPTION_ATTRIBUTIONS_SERVICE],
  imports: [],
  providers: [
    SubscriptionAttributionsService,
    subscriptionAttributionsServiceProvider(),
  ],
};
