import type {
  IPlatformComparison,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { apiRequest } from '@/services/api/base-http.service';
import type { RequestScope } from '@/services/api/request-scope';

export interface AnalyticsQueryOptions {
  endDate?: string;
  limit?: number;
  metric?: string;
  platform?: string;
  startDate?: string;
}

function scopedParams(
  scope: RequestScope,
  options?: AnalyticsQueryOptions,
): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {
    brandId: scope.brandId,
    organizationId: scope.organizationId,
  };

  if (options?.endDate) {
    params.endDate = options.endDate;
  }
  if (options?.limit !== undefined) {
    params.limit = options.limit;
  }
  if (options?.metric) {
    params.metric = options.metric;
  }
  if (options?.platform) {
    params.platform = options.platform;
  }
  if (options?.startDate) {
    params.startDate = options.startDate;
  }

  return params;
}

class AnalyticsService {
  private request<T>(
    token: string,
    endpoint: string,
    scope: RequestScope,
    options?: AnalyticsQueryOptions,
  ): Promise<T> {
    return apiRequest<T>(token, `analytics/${endpoint}`, {
      params: scopedParams(scope, options),
    });
  }

  getOverview(
    token: string,
    scope: RequestScope,
    options?: AnalyticsQueryOptions,
  ): Promise<JsonApiSingleResponse<unknown>> {
    return this.request(token, 'overview', scope, options);
  }

  getTopContent(
    token: string,
    scope: RequestScope,
    options?: AnalyticsQueryOptions,
  ): Promise<JsonApiCollectionResponse<unknown>> {
    return this.request(token, 'top', scope, options);
  }

  getPlatformStats(
    token: string,
    scope: RequestScope,
    options?: AnalyticsQueryOptions,
  ): Promise<JsonApiCollectionResponse<IPlatformComparison>> {
    return this.request(token, 'platforms', scope, options);
  }

  getGrowthTrends(
    token: string,
    scope: RequestScope,
    options?: AnalyticsQueryOptions,
  ): Promise<JsonApiSingleResponse<unknown>> {
    return this.request(token, 'growth', scope, options);
  }

  getEngagement(
    token: string,
    scope: RequestScope,
    options?: AnalyticsQueryOptions,
  ): Promise<JsonApiSingleResponse<unknown>> {
    return this.request(token, 'engagement', scope, options);
  }
}

export const analyticsService = new AnalyticsService();
