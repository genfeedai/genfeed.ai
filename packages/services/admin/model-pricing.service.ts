import type {
  AdminModelPricingReport,
  ModelPricingFixResult,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminModelPricingService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/model-pricing`, token);
  }

  public static getInstance(token: string): AdminModelPricingService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminModelPricingService,
      token,
    ) as AdminModelPricingService;
  }

  async getReport(signal?: AbortSignal): Promise<AdminModelPricingReport> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      signal,
    });
    return deserializeResource<AdminModelPricingReport>(response.data);
  }

  /** Promote a model's pending provider rates; returns the refreshed report. */
  async approveRates(
    modelId: string,
    expectedPendingVersion: string,
  ): Promise<AdminModelPricingReport> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${encodeURIComponent(modelId)}/approve-rates`,
      { expectedPendingVersion },
    );
    return deserializeResource<AdminModelPricingReport>(response.data);
  }

  /**
   * Approve pending provider rates and queue price imports for the given models
   * (every model that needs it when none are given).
   */
  async fixPricing(modelIds?: string[]): Promise<ModelPricingFixResult> {
    const response = await this.instance.post<ModelPricingFixResult>(
      'fix',
      modelIds?.length ? { modelIds } : {},
    );
    return response.data;
  }
}
