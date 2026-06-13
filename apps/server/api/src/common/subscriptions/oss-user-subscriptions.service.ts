import type {
  IUserSubscriptionOssReadModel,
  IUserSubscriptionsService,
} from '@genfeedai/interfaces/billing';
import { ForbiddenException, Injectable } from '@nestjs/common';

function enterpriseBillingUnavailable(): never {
  throw new ForbiddenException(
    'Enterprise subscription billing is not available in OSS mode.',
  );
}

/**
 * OSS no-op implementation of {@link IUserSubscriptionsService}.
 *
 * Bound to the `USER_SUBSCRIPTIONS_SERVICE` token when no enterprise license is
 * present.
 *
 * - `findByUser` (read path) and `updateFromStripeSession` (always-on webhook)
 *   return domain-safe values and NEVER throw.
 * - `getOrCreateSubscription` (user-initiated checkout) THROWS
 *   `ForbiddenException`, mirroring `OssSubscriptionsService.createForOrganization`.
 */
@Injectable()
export class OssUserSubscriptionsService implements IUserSubscriptionsService {
  async findByUser(
    _userId: string,
  ): Promise<IUserSubscriptionOssReadModel | null> {
    return null;
  }

  async getOrCreateSubscription(
    _userId: string,
    _stripeCustomerId: string,
  ): Promise<IUserSubscriptionOssReadModel> {
    return enterpriseBillingUnavailable();
  }

  async updateFromStripeSession(
    _userId: string,
    _session: unknown,
  ): Promise<IUserSubscriptionOssReadModel | null> {
    return null;
  }
}
