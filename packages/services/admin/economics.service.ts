import type {
  IEconomicsCostReport,
  IEconomicsCoverageReport,
  IEconomicsOverviewReport,
  IEconomicsQuery,
  IEconomicsRevenueReport,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminEconomicsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/economics`, token);
  }

  public static getInstance(token: string): AdminEconomicsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminEconomicsService,
      token,
    ) as AdminEconomicsService;
  }

  getOverview(
    query: IEconomicsQuery,
    signal?: AbortSignal,
  ): Promise<IEconomicsOverviewReport> {
    return this.read<IEconomicsOverviewReport>('/overview', query, signal);
  }

  getRevenue(
    query: IEconomicsQuery,
    signal?: AbortSignal,
  ): Promise<IEconomicsRevenueReport> {
    return this.read<IEconomicsRevenueReport>('/revenue', query, signal);
  }

  getCosts(
    query: IEconomicsQuery,
    signal?: AbortSignal,
  ): Promise<IEconomicsCostReport> {
    return this.read<IEconomicsCostReport>('/costs', query, signal);
  }

  getCoverage(
    query: IEconomicsQuery,
    signal?: AbortSignal,
  ): Promise<IEconomicsCoverageReport> {
    return this.read<IEconomicsCoverageReport>('/coverage', query, signal);
  }

  private async read<T>(
    path: string,
    query: IEconomicsQuery,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.instance.get<JsonApiResponseDocument>(path, {
      params: query,
      signal,
    });
    return deserializeResource<T>(response.data);
  }
}
