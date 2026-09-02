import type {
  ISubscriptionFindAllInput,
  ISubscriptionFindAllOptions,
  ISubscriptionFindAllResult,
  ISubscriptionFindOneFilter,
  ISubscriptionOssReadModel,
  ISubscriptionsService,
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
 * Community no-op implementation of {@link ISubscriptionsService}.
 *
 * Bound to the `SUBSCRIPTIONS_SERVICE` token when organization billing is not
 * live at runtime (`hasOrganizationBilling()` is false). Two behavioural rules, enforced by the contract docs:
 *
 * - **Always-on webhook paths** (`findOne`, `patch`, `findByStripeCustomerId`,
 *   `syncWithStripe`, `syncSubscriptionState`, `findAll`,
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
    _input: ISubscriptionFindAllInput,
    _options: ISubscriptionFindAllOptions,
    _enableCache?: boolean,
  ): Promise<ISubscriptionFindAllResult> {
    return { docs: [], total: 0, totalDocs: 0 };
  }

  async patch(
    _subscriptionId: string,
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
    return organizationBillingUnavailable();
  }

  async syncSubscriptionState(
    _subscription: ISubscriptionOssReadModel | null,
    _stripeSubscriptionId?: string,
    _stripePriceId?: string,
    _status?: string,
    _subscriptionTier?: string,
  ): Promise<void> {}
}
