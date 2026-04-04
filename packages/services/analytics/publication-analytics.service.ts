import type {
  IAnalyticsRefreshResponse,
  IPostAnalytics,
  IPostAnalyticsSummary,
  IQueryParams,
} from '@cloud/interfaces';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
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
  ): Promise<{
    summary: IPostAnalyticsSummary;
    dateRangeAnalytics?: IPostAnalytics[];
  }> {
    const params: IQueryParams = {};

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

  public async postAnalytics(publicationId: string): Promise<{
    summary: IPostAnalyticsSummary;
    lastRefreshed: string;
  }> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/${publicationId}/analytics`)
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
