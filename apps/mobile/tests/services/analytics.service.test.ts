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

    apiRequest
      .mockResolvedValueOnce({ data: { kind: 'overview' } })
      .mockResolvedValueOnce({ data: { kind: 'top' } })
      .mockResolvedValueOnce({ data: { kind: 'platforms' } })
      .mockResolvedValueOnce({ data: { kind: 'growth' } })
      .mockResolvedValueOnce({ data: { kind: 'engagement' } });

    const overview = await analyticsService.getOverview(
      'token',
      scope,
      options,
    );
    const top = await analyticsService.getTopContent('token', scope, {
      ...options,
      limit: 5,
    });
    const platforms = await analyticsService.getPlatformStats(
      'token',
      scope,
      options,
    );
    const growth = await analyticsService.getGrowthTrends(
      'token',
      scope,
      options,
    );
    const engagement = await analyticsService.getEngagement(
      'token',
      scope,
      options,
    );

    expect(overview).toEqual({ data: { kind: 'overview' } });
    expect(top).toEqual({ data: { kind: 'top' } });
    expect(platforms).toEqual({ data: { kind: 'platforms' } });
    expect(growth).toEqual({ data: { kind: 'growth' } });
    expect(engagement).toEqual({ data: { kind: 'engagement' } });

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
