import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type { ITopbarBalances } from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface ByokUsageSummary {
  totalUsage: number;
  freeThreshold: number;
  freeRemaining: number;
  billableUsage: number;
  projectedFee: number;
  billingStatus: string;
  rollover: number;
  periodStart: string;
  periodEnd: string;
}

export class CreditsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/credits`, token);
  }

  static getInstance(token: string): CreditsService {
    return HTTPBaseService.getBaseServiceInstance(
      CreditsService,
      token,
    ) as CreditsService;
  }

  async getByokUsageSummary(): Promise<ByokUsageSummary> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/byok-usage-summary',
    );

    return deserializeResource<ByokUsageSummary>(response.data);
  }

  async getTopbarBalances(): Promise<ITopbarBalances> {
    const response =
      await this.instance.get<JsonApiResponseDocument>('/topbar-balances');

    return deserializeResource<ITopbarBalances>(response.data);
  }
}
