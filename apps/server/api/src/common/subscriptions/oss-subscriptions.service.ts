import type {
  ISubscriptionFindAllOptions,
  ISubscriptionFindAllResult,
  ISubscriptionFindOneFilter,
  ISubscriptionOssReadModel,
  ISubscriptionsService,
} from '@genfeedai/interfaces/billing';
import { Injectable } from '@nestjs/common';

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
}
