/**
 * Runtime billing gate.
 *
 * SaaS and community images ship the same billing code (AGPL). Which
 * implementation each shared billing token resolves to — and whether the
 * billing HTTP routes exist at all — is decided at boot by
 * `hasOrganizationBilling()` (SaaS cloud, or a licensed self-host), not by a
 * build flavor. `initializeLicenseVerification()` runs in `main.ts` before the
 * app module is imported, so calling the gate from `@Module()` metadata is
 * safe — the same pattern `CreditsModule` uses for `usesMeteredCredits()`.
 *
 * Every string token (see `@genfeedai/contracts/interfaces/billing` `billing.tokens.ts`)
 * binds to the real Stripe-backed service when organization billing is live,
 * and to the colocated community stub otherwise. The stubs honour the
 * contract's behavioural split: always-on webhook/read paths return
 * domain-safe values, user-initiated billing throws `ForbiddenException`.
 */

import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import type { Provider, Type } from '@nestjs/common';
import { OssSubscriptionAttributionsService } from './oss-subscription-attributions.service';
import { OssSubscriptionsService } from './oss-subscriptions.service';
import { OssUserSubscriptionsService } from './oss-user-subscriptions.service';

/**
 * Billing controllers are registered only when organization billing is live.
 * A community self-host exposes no billing routes rather than 403-ing them.
 */
export function billingControllers(controllers: Type[]): Type[] {
  return hasOrganizationBilling() ? controllers : [];
}

export function subscriptionsServiceProvider(): Provider {
  return hasOrganizationBilling()
    ? { provide: SUBSCRIPTIONS_SERVICE, useExisting: SubscriptionsService }
    : { provide: SUBSCRIPTIONS_SERVICE, useClass: OssSubscriptionsService };
}

export function userSubscriptionsServiceProvider(): Provider {
  return hasOrganizationBilling()
    ? {
        provide: USER_SUBSCRIPTIONS_SERVICE,
        useExisting: UserSubscriptionsService,
      }
    : {
        provide: USER_SUBSCRIPTIONS_SERVICE,
        useClass: OssUserSubscriptionsService,
      };
}

export function subscriptionAttributionsServiceProvider(): Provider {
  return hasOrganizationBilling()
    ? {
        provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
        useExisting: SubscriptionAttributionsService,
      }
    : {
        provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
        useClass: OssSubscriptionAttributionsService,
      };
}
