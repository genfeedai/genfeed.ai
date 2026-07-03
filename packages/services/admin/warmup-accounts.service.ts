import type {
  IWarmupAccount,
  IWarmupAccountCreateRequest,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminWarmupAccountsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/warmup-accounts`, token);
  }

  public static getInstance(token: string): AdminWarmupAccountsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminWarmupAccountsService,
      token,
    ) as AdminWarmupAccountsService;
  }

  async createWarmupAccount(
    data: IWarmupAccountCreateRequest,
  ): Promise<IWarmupAccount> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      data,
    );
    return deserializeResource<IWarmupAccount>(response.data);
  }

  async getWarmupAccount(id: string): Promise<IWarmupAccount> {
    const response = await this.instance.get<JsonApiResponseDocument>(`/${id}`);
    return deserializeResource<IWarmupAccount>(response.data);
  }

  async getWarmupAccounts(): Promise<IWarmupAccount[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('');
    return deserializeCollection<IWarmupAccount>(response.data);
  }
}
