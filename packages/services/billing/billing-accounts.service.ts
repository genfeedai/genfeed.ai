import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IBillingAccount } from '@genfeedai/contracts/interfaces';
import { BillingAccount } from '@genfeedai/models/billing/billing-account.model';
import { BillingAccountSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class BillingAccountsService extends BaseService<BillingAccount> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.BILLING_ACCOUNTS,
      token,
      BillingAccount,
      BillingAccountSerializer,
    );
  }

  public static getInstance(token: string): BillingAccountsService {
    return BaseService.getDataServiceInstance(BillingAccountsService, token);
  }

  public async getCurrent(): Promise<IBillingAccount> {
    const res = await this.instance.get<JsonApiResponseDocument>('current');
    return deserializeResource<IBillingAccount>(res.data);
  }
}
