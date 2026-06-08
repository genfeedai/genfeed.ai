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
    _pipeline: unknown[],
    _options: ISubscriptionFindAllOptions,
  ): Promise<ISubscriptionFindAllResult> {
    return { total: 0 };
  }

  async createForOrganization(
    _organization: unknown,
    _billingEmail: string,
    _userId: string,
  ): Promise<never> {
    return enterpriseBillingUnavailable();
  }

  async changeSubscriptionPlan(
    _organizationId: string,
    _newPriceId: string,
  ): Promise<never> {
    return enterpriseBillingUnavailable();
  }

  async previewSubscriptionChange(
    _organizationId: string,
    _newPriceId: string,
  ): Promise<never> {
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
