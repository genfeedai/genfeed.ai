import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/base-http.service', () => ({
  apiRequest,
}));

import {
  type AnalyticsQueryOptions,
  analyticsService,
} from '@/services/api/analytics.service';

describe('analyticsService', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: {} });
  });

  // The API's `AnalyticsDateRangeDto` only declares `brandId`; the validation
  // pipe silently strips `brand`, widening reads to the whole organization.
  it('prefixes every request with analytics/ and forwards query params', async () => {
    const options = {
      brandId: 'acme',
      startDate: '2026-08-01',
    } satisfies AnalyticsQueryOptions;

    await analyticsService.getOverview('token', options);
    await analyticsService.getTopContent('token', { ...options, limit: 5 });
    await analyticsService.getPlatformStats('token', options);
    await analyticsService.getGrowthTrends('token', options);
    await analyticsService.getEngagement('token', options);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      'token',
      'analytics/overview',
      {
        params: options,
      },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(2, 'token', 'analytics/top', {
      params: { ...options, limit: 5 },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      'token',
      'analytics/platforms',
      {
        params: options,
      },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(4, 'token', 'analytics/growth', {
      params: options,
    });
    expect(apiRequest).toHaveBeenNthCalledWith(
      5,
      'token',
      'analytics/engagement',
      {
        params: options,
      },
    );
  });
});
