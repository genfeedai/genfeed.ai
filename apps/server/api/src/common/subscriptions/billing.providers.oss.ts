/**
 * OSS billing DI fragments — the community (selfhosted) flavor of
 * `@billing-providers`.
 *
 * Resolved by the webpack `@billing-providers` alias (and the matching tsconfig
 * path) whenever `ee/packages/billing` is absent from the build, which is the
 * case for the AGPL community image. Each api billing collection module composes
 * its `@Module()` metadata directly from the matching fragment here, so the OSS
 * webpack graph never compile-time depends on enterprise billing code.
 *
 * Every fragment binds the shared string token (see `billing.tokens.ts`) to the
 * colocated no-op stub. The stubs honour the contract's behavioural split:
 * always-on webhook/read paths return domain-safe values, user-initiated billing
 * throws `ForbiddenException`. No controllers are registered — the enterprise
 * billing routes simply do not exist in the community image.
 *
 * The EE flavor lives at `ee/packages/billing/src/billing.providers.ee.ts` and
 * must keep the same three named exports with the same fragment shape.
 */

import {
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import type { ModuleMetadata } from '@nestjs/common';
import { OssSubscriptionAttributionsService } from './oss-subscription-attributions.service';
import { OssSubscriptionsService } from './oss-subscriptions.service';
import { OssUserSubscriptionsService } from './oss-user-subscriptions.service';

/**
 * The slice of Nest module metadata a billing fragment contributes. Both the
 * OSS and EE flavors export three of these so the api modules can drop them
 * straight into `@Module()`.
 */
export type BillingProviderFragment = Pick<
  ModuleMetadata,
  'controllers' | 'exports' | 'imports' | 'providers'
>;

export const subscriptions: BillingProviderFragment = {
  controllers: [],
  exports: [SUBSCRIPTIONS_SERVICE],
  imports: [],
  providers: [
    { provide: SUBSCRIPTIONS_SERVICE, useClass: OssSubscriptionsService },
  ],
};

export const userSubscriptions: BillingProviderFragment = {
  controllers: [],
  exports: [USER_SUBSCRIPTIONS_SERVICE],
  imports: [],
  providers: [
    {
      provide: USER_SUBSCRIPTIONS_SERVICE,
      useClass: OssUserSubscriptionsService,
    },
  ],
};

export const subscriptionAttributions: BillingProviderFragment = {
  controllers: [],
  exports: [SUBSCRIPTION_ATTRIBUTIONS_SERVICE],
  imports: [],
  providers: [
    {
      provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
      useClass: OssSubscriptionAttributionsService,
    },
  ],
};
