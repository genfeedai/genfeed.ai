import type { IWeeklyPerformanceSummary } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface IWeeklySummaryQueryParams {
  brandId: string;
  topN?: number;
  worstN?: number;
  startDate?: string;
  endDate?: string;
}

export class ContentPerformanceService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}/content-performance/summary`,
      token,
    );
  }

  public static getInstance(token: string): ContentPerformanceService {
    return HTTPBaseService.getBaseServiceInstance(
      ContentPerformanceService,
      token,
    ) as ContentPerformanceService;
  }

  public async getWeeklySummary(
    params: IWeeklySummaryQueryParams,
  ): Promise<IWeeklyPerformanceSummary> {
    return await this.instance
      .get<JsonApiResponseDocument>('weekly', { params })
      .then((res) => deserializeResource<IWeeklyPerformanceSummary>(res.data));
  }
}
