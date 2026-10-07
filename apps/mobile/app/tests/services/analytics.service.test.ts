import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/base-http.service', () => ({
  apiRequest,
}));

import { analyticsService } from '@/services/api/analytics.service';

const scope = { brandId: 'brand-1', organizationId: 'org-1' };

describe('analyticsService', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: {} });
  });

  it('prefixes every request with analytics/ and forwards org and brand scope', async () => {
    const options = { startDate: '2026-08-01' };
    const scoped = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      startDate: '2026-08-01',
    };

    await analyticsService.getOverview('token', scope, options);
    await analyticsService.getTopContent('token', scope, {
      ...options,
      limit: 5,
    });
    await analyticsService.getPlatformStats('token', scope, options);
    await analyticsService.getGrowthTrends('token', scope, options);
    await analyticsService.getEngagement('token', scope, options);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      'token',
      'analytics/overview',
      { params: scoped },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(2, 'token', 'analytics/top', {
      params: { ...scoped, limit: 5 },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      'token',
      'analytics/platforms',
      { params: scoped },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(4, 'token', 'analytics/growth', {
      params: scoped,
    });
    expect(apiRequest).toHaveBeenNthCalledWith(
      5,
      'token',
      'analytics/engagement',
      { params: scoped },
    );
  });
});
