import type {
  ISubscriptionFindAllOptions,
  ISubscriptionFindAllResult,
  ISubscriptionFindOneFilter,
  ISubscriptionOssReadModel,
  ISubscriptionsService,
} from '@genfeedai/interfaces/billing';
import { ForbiddenException, Injectable } from '@nestjs/common';

function enterpriseBillingUnavailable(): never {
  throw new ForbiddenException(
    'Enterprise subscription billing is not available in OSS mode.',
  );
}

/**
 * OSS no-op implementation of {@link ISubscriptionsService}.
 *
 * Bound to the `SUBSCRIPTIONS_SERVICE` token when no enterprise license is
 * present. Two behavioural rules, enforced by the contract docs:
 *
 * - **Always-on webhook paths** (`findOne`, `patch`, `findByStripeCustomerId`,
 *   `syncWithStripe`, `syncSubscriptionToClerkMetadata`, `findAll`,
 *   `findByOrganizationId`) return domain-safe values and NEVER throw — the
 *   Stripe webhook fires continuously and a throw would 500 it on a
 *   self-hosted install that never provisioned billing.
 * - **User-initiated billing** (`createForOrganization`) THROWS
 *   `ForbiddenException` — surfacing "billing unavailable" to a user clicking
 *   subscribe is correct; fabricating a record would be a lie.
 */
@Injectable()
export class OssSubscriptionsService implements ISubscriptionsService {
  async findOne(
    _filter: ISubscriptionFindOneFilter,
  ): Promise<ISubscriptionOssReadModel | null> {
    return null;
  }

  async findByOrganizationId(
    _organizationId: string,
  ): Promise<ISubscriptionOssReadModel | null> {
    return null;
  }

  async findAll(
    _input: unknown,
    _options: ISubscriptionFindAllOptions,
    _enableCache?: boolean,
  ): Promise<ISubscriptionFindAllResult> {
    return { docs: [], total: 0 };
  }

  async patch(
    _id: string,
    _data: unknown,
  ): Promise<ISubscriptionOssReadModel | null> {
    return null;
  }

  async findByStripeCustomerId(
    _stripeCustomerId: string,
  ): Promise<ISubscriptionOssReadModel | null> {
    return null;
  }

  async syncWithStripe(
    subscription: ISubscriptionOssReadModel,
  ): Promise<ISubscriptionOssReadModel> {
    return subscription;
  }

  async createForOrganization(
    _organization: unknown,
    _billingEmail: string,
    _userId: string,
  ): Promise<ISubscriptionOssReadModel> {
    return enterpriseBillingUnavailable();
  }

  async syncSubscriptionToClerkMetadata(
    _subscription: unknown,
    _stripeSubscriptionId?: string,
    _stripePriceId?: string,
    _status?: string,
    _subscriptionTier?: string,
  ): Promise<void> {}
}
