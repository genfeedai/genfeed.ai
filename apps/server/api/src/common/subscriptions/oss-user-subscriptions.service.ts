import type {
  IUserSubscriptionOssReadModel,
  IUserSubscriptionsService,
} from '@genfeedai/contracts/interfaces/billing';
import { ForbiddenException, Injectable } from '@nestjs/common';

function organizationBillingUnavailable(): never {
  throw new ForbiddenException(
    'Organization subscription billing is not enabled on this deployment. ' +
      'Hosted *.genfeed.ai APIs run with GENFEED_CLOUD=true; a licensed self-host sets GENFEED_LICENSE_KEY. ' +
      'Self-hosted community deployments use managed credits checkout instead of org Stripe subscriptions. ' +
      'See docs/deployment-modes.md.',
  );
}

/**
 * Community no-op implementation of {@link IUserSubscriptionsService}.
 *
 * Bound to the `USER_SUBSCRIPTIONS_SERVICE` token when organization billing is not
 * live at runtime (`hasOrganizationBilling()` is false).
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
  ): Promise<IUserSubscriptionOssReadModel> {
    return organizationBillingUnavailable();
  }

  async updateFromStripeSession(
    _userId: string,
    _session: unknown,
  ): Promise<IUserSubscriptionOssReadModel | null> {
    return null;
  }
}
