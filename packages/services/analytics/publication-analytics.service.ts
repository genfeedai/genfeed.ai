import type {
  IAnalyticsRefreshResponse,
  IPostAnalytics,
  IPostAnalyticsSummary,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import type { AxiosResponse } from 'axios';

export class PostAnalyticsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/posts`, token);
  }

  public static getInstance(token: string): PostAnalyticsService {
    return HTTPBaseService.getBaseServiceInstance(
      PostAnalyticsService,
      token,
    ) as PostAnalyticsService;
  }

  public async getPostAnalytics(
    publicationId: string,
    startDate?: string,
    endDate?: string,
    brandId?: string,
  ): Promise<{
    summary: IPostAnalyticsSummary;
    dateRangeAnalytics?: IPostAnalytics[];
  }> {
    const params: IQueryParams = {};

    if (brandId) {
      params.brandId = brandId;
    }

    if (startDate) {
      params.startDate = startDate;
    }

    if (endDate) {
      params.endDate = endDate;
    }

    return await this.instance
      .get<JsonApiResponseDocument>(`/${publicationId}/analytics`, { params })
      .then((res: AxiosResponse<JsonApiResponseDocument>) =>
        deserializeResource<{
          summary: IPostAnalyticsSummary;
          dateRangeAnalytics?: IPostAnalytics[];
        }>(res.data),
      );
  }

  public async postAnalytics(
    publicationId: string,
    brandId?: string,
  ): Promise<{
    summary: IPostAnalyticsSummary;
    lastRefreshed: string;
  }> {
    return await this.instance
      .post<JsonApiResponseDocument>(
        `/${publicationId}/refresh-analytics`,
        ...(brandId ? [undefined, { params: { brandId } }] : []),
      )
      .then((res: AxiosResponse<JsonApiResponseDocument>) =>
        deserializeResource<{
          summary: IPostAnalyticsSummary;
          lastRefreshed: string;
        }>(res.data),
      );
  }

  public async postAllAnalytics(): Promise<IAnalyticsRefreshResponse> {
    return await this.instance
      .post<JsonApiResponseDocument>('analytics')
      .then((res: AxiosResponse<JsonApiResponseDocument>) =>
        deserializeResource<IAnalyticsRefreshResponse>(res.data),
      );
  }
}
