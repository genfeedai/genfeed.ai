/**
 * EE billing DI fragments — the enterprise (SaaS) flavor of `@billing-providers`.
 *
 * Resolved by the webpack `@billing-providers` alias whenever
 * `ee/packages/billing` is present in the build (the `Dockerfile.server` SaaS
 * image). The three api billing collection modules compose their `@Module()`
 * metadata directly from the matching fragment here, so the EE controllers and
 * services register exactly as they did before the decouple.
 *
 * Two-layer gating:
 *   1. Build-time — webpack only aliases `@billing-providers` to THIS file when
 *      `ee/packages/billing/src` exists on disk. The community image never sees
 *      it; it gets `billing.providers.oss.ts` instead.
 *   2. Runtime — `isEEEnabled()` (license key present) decides only what the
 *      shared string token resolves to. The real EE service class is ALWAYS
 *      registered as a provider so the EE controllers (which inject the class
 *      token directly) keep working; the string token that the rest of the api
 *      tree injects points at the real service when licensed, or the OSS no-op
 *      stub when not.
 *
 * The OSS counterpart lives at
 * `apps/server/api/src/common/subscriptions/billing.providers.oss.ts` and must
 * keep the same three named exports with the same fragment shape.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { UsersModule } from '@api/collections/users/users.module';
import type { BillingProviderFragment } from '@api/common/subscriptions/billing.providers.oss';
import { OssSubscriptionAttributionsService } from '@api/common/subscriptions/oss-subscription-attributions.service';
import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { OssUserSubscriptionsService } from '@api/common/subscriptions/oss-user-subscriptions.service';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { isEEEnabled } from '@genfeedai/config';
import {
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { forwardRef } from '@nestjs/common';
import { SubscriptionAttributionsController } from './subscription-attributions/controllers/subscription-attributions.controller';
import { SubscriptionAttributionsService } from './subscription-attributions/services/subscription-attributions.service';
import { SubscriptionsController } from './subscriptions/controllers/subscriptions.controller';
import { SubscriptionsService } from './subscriptions/services/subscriptions.service';
import { UserSubscriptionsService } from './user-subscriptions/services/user-subscriptions.service';

export const subscriptions: BillingProviderFragment = {
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService, SUBSCRIPTIONS_SERVICE],
  imports: [
    forwardRef(() => ClerkModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    SubscriptionsService,
    isEEEnabled()
      ? { provide: SUBSCRIPTIONS_SERVICE, useExisting: SubscriptionsService }
      : { provide: SUBSCRIPTIONS_SERVICE, useClass: OssSubscriptionsService },
  ],
};

export const userSubscriptions: BillingProviderFragment = {
  controllers: [],
  exports: [UserSubscriptionsService, USER_SUBSCRIPTIONS_SERVICE],
  imports: [],
  providers: [
    UserSubscriptionsService,
    isEEEnabled()
      ? {
          provide: USER_SUBSCRIPTIONS_SERVICE,
          useExisting: UserSubscriptionsService,
        }
      : {
          provide: USER_SUBSCRIPTIONS_SERVICE,
          useClass: OssUserSubscriptionsService,
        },
  ],
};

export const subscriptionAttributions: BillingProviderFragment = {
  controllers: [SubscriptionAttributionsController],
  exports: [SubscriptionAttributionsService, SUBSCRIPTION_ATTRIBUTIONS_SERVICE],
  imports: [],
  providers: [
    SubscriptionAttributionsService,
    isEEEnabled()
      ? {
          provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
          useExisting: SubscriptionAttributionsService,
        }
      : {
          provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
          useClass: OssSubscriptionAttributionsService,
        },
  ],
};
