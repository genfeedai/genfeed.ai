import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/base-http.service', () => ({
  apiRequest,
}));

import { analyticsService } from '@/services/api/analytics.service';

describe('analyticsService', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: {} });
  });

  it('prefixes every request with analytics/ and forwards query params', async () => {
    const options = { brand: 'acme', startDate: '2026-08-01' };

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
