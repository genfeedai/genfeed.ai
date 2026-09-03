import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService('analytics-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = AnalyticsService.getInstance('tok');
    expect(AnalyticsService.getInstance('tok')).toBe(first);
  });

  it('findAll GETs the root analytics resource', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ views: 100 }, { id: 'analytics' })),
    );

    const result = await service.findAll({ timeframe: '30d' });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { timeframe: '30d' },
    });
    expect(result).toMatchObject({ views: 100 });
  });

  it('exportData GETs the export as an arraybuffer', async () => {
    const buffer = new ArrayBuffer(8);
    http.get.mockResolvedValue(axiosResponse(buffer));

    const result = await service.exportData('csv', ['views', 'likes'], {
      timeframe: '7d',
    });

    expect(http.get).toHaveBeenCalledWith('export', {
      params: { fields: 'views,likes', format: 'csv', timeframe: '7d' },
      responseType: 'arraybuffer',
    });
    expect(result).toBe(buffer);
  });

  describe('resource endpoints', () => {
    const resourceEndpoints = [
      ['getOverview', 'overview'],
      ['getPlatformComparison', 'platforms'],
      ['getTimeSeries', 'timeseries'],
      ['getGrowthTrends', 'growth'],
      ['getEngagement', 'engagement'],
      ['getAccountAnalytics', 'accounts'],
      ['getTopAccounts', 'accounts/top'],
      ['getFleetEvaluationPolicy', 'fleet-evaluation-policy'],
    ] as const;

    it.each(resourceEndpoints)(
      '%s GETs %s and deserializes the resource',
      async (method, path) => {
        http.get.mockResolvedValue(
          axiosResponse(resourceDocument({ value: 1 }, { id: 'r_1' })),
        );

        const result = await service[method]({ limit: 5 });

        expect(http.get).toHaveBeenCalledWith(path, {
          params: { limit: 5 },
        });
        expect(result).toMatchObject({ id: 'r_1', value: 1 });
      },
    );

    it('getTopContent GETs top and deserializes the collection', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'c_1', views: 9 }])),
      );

      const result = await service.getTopContent();

      expect(http.get).toHaveBeenCalledWith('top', { params: undefined });
      expect(result).toEqual([{ id: 'c_1', views: 9 }]);
    });

    it('getViralHooks GETs hooks and deserializes the resource', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            { analysis: { patterns: [] }, videos: [] },
            { id: 'hooks' },
          ),
        ),
      );

      const result = await service.getViralHooks();

      expect(http.get).toHaveBeenCalledWith('hooks', { params: undefined });
      expect(result).toMatchObject({ videos: [] });
    });
  });

  describe('admin analytics', () => {
    it('getOrganizationsLeaderboard GETs the org leaderboard', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'org_1', views: 50 }])),
      );

      const result = await service.getOrganizationsLeaderboard({ limit: 10 });

      expect(http.get).toHaveBeenCalledWith('organizations/leaderboard', {
        params: { limit: 10 },
      });
      expect(result).toEqual([{ id: 'org_1', views: 50 }]);
    });

    it('getBrandsLeaderboard GETs the brand leaderboard', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'brand_1', views: 20 }])),
      );

      const result = await service.getBrandsLeaderboard();

      expect(http.get).toHaveBeenCalledWith('brands/leaderboard', {
        params: undefined,
      });
      expect(result).toEqual([{ id: 'brand_1', views: 20 }]);
    });

    it('getOrganizationsWithStats GETs paginated org stats', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            {
              data: [],
              pagination: { limit: 10, page: 1, total: 0, totalPages: 1 },
            },
            { id: 'orgs' },
          ),
        ),
      );

      const result = await service.getOrganizationsWithStats({ page: 1 });

      expect(http.get).toHaveBeenCalledWith('organizations', {
        params: { page: 1 },
      });
      expect(result).toMatchObject({ data: [] });
    });

    it('getBrandsWithStats GETs paginated brand stats', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            {
              data: [],
              pagination: { limit: 10, page: 2, total: 0, totalPages: 1 },
            },
            { id: 'brands' },
          ),
        ),
      );

      const result = await service.getBrandsWithStats({ page: 2 });

      expect(http.get).toHaveBeenCalledWith('brands', {
        params: { page: 2 },
      });
      expect(result.pagination.page).toBe(2);
    });

    it('getBusinessAnalytics GETs the business dashboard', async () => {
      http.get.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            { revenue: { last7d: 10, today: 1 } },
            { id: 'business' },
          ),
        ),
      );

      const result = await service.getBusinessAnalytics();

      expect(http.get).toHaveBeenCalledWith('business');
      expect(result).toMatchObject({ revenue: { today: 1 } });
    });
  });
});
