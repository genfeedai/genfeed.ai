import type { CreditUsageMetrics } from '@services/billing/credits.service';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/** Operator reads of another organization's credits. */
export class AdminOrganizationCreditsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/organizations`, token);
  }

  static getInstance(token: string): AdminOrganizationCreditsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminOrganizationCreditsService,
      token,
    ) as AdminOrganizationCreditsService;
  }

  /** The organization's last 30 days of usage, per day and per source. */
  async getUsage(
    organizationId: string,
    signal?: AbortSignal,
  ): Promise<CreditUsageMetrics> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `${encodeURIComponent(organizationId)}/credits/usage`,
      { signal },
    );
    return deserializeResource<CreditUsageMetrics>(response.data);
  }
}
