import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
} from '@services/__mocks__/http.mock';
import { TrendsService } from '@services/social/trends.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendsService HTTP methods', () => {
  let service: TrendsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrendsService('trends-token');
    http = installMockHttp(service);
  });

  describe('preferences', () => {
    it('getPreferences unwraps the preferences envelope', async () => {
      const preferences = { platforms: ['tiktok'] };
      http.get.mockResolvedValue(axiosResponse({ preferences }));

      const result = await service.getPreferences();

      expect(http.get).toHaveBeenCalledWith('preferences');
      expect(result).toEqual(preferences);
    });

    it('getPreferences returns null when unset', async () => {
      http.get.mockResolvedValue(axiosResponse({}));
      await expect(service.getPreferences()).resolves.toBeNull();
    });

    it('savePreferences PUTs and falls back to the input on empty response', async () => {
      http.put.mockResolvedValue(axiosResponse({}));
      const preferences = { brandId: 'brand_1', platforms: ['tiktok'] };

      const result = await service.savePreferences(preferences);

      expect(http.put).toHaveBeenCalledWith('preferences', preferences);
      expect(result).toEqual(preferences);
    });

    it('savePreferences returns the server preferences when present', async () => {
      const serverPreferences = { platforms: ['youtube'] };
      http.put.mockResolvedValue(
        axiosResponse({ preferences: serverPreferences }),
      );

      const result = await service.savePreferences({ platforms: ['tiktok'] });

      expect(result).toEqual(serverPreferences);
    });
  });

  it('getTrendingTopics deserializes the collection', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'trend_1', label: 'AI' }])),
    );

    const result = await service.getTrendingTopics();

    expect(http.get).toHaveBeenCalledWith('/');
    expect(result).toEqual([{ id: 'trend_1', label: 'AI' }]);
  });

  describe('viral listings', () => {
    it('getViralVideos passes only defined filters and unwraps videos', async () => {
      http.get.mockResolvedValue(
        axiosResponse({ videos: [{ id: 'video_1' }] }),
      );

      const result = await service.getViralVideos({
        limit: 5,
        platform: 'tiktok',
        timeframe: '7d',
      });

      expect(http.get).toHaveBeenCalledWith('/videos', {
        params: { limit: 5, platform: 'tiktok', timeframe: '7d' },
      });
      expect(result).toEqual([{ id: 'video_1' }]);
    });

    it('getViralVideos defaults to [] when the payload is empty', async () => {
      http.get.mockResolvedValue(axiosResponse({}));
      await expect(service.getViralVideos()).resolves.toEqual([]);
      expect(http.get).toHaveBeenCalledWith('/videos', { params: {} });
    });

    it('getViralLeaderboard unwraps the leaderboard', async () => {
      http.get.mockResolvedValue(
        axiosResponse({ leaderboard: [{ id: 'video_2' }] }),
      );

      const result = await service.getViralLeaderboard({
        limit: 10,
        timeframe: '24h',
      });

      expect(http.get).toHaveBeenCalledWith('/leaderboard', {
        params: { limit: 10, timeframe: '24h' },
      });
      expect(result).toEqual([{ id: 'video_2' }]);
    });

    it('getTrendingHashtags unwraps hashtags', async () => {
      http.get.mockResolvedValue(axiosResponse({ hashtags: [{ tag: '#ai' }] }));

      const result = await service.getTrendingHashtags({
        limit: 3,
        platform: 'instagram',
      });

      expect(http.get).toHaveBeenCalledWith('/hashtags', {
        params: { limit: 3, platform: 'instagram' },
      });
      expect(result).toEqual([{ tag: '#ai' }]);
    });

    it('getTrendingSounds unwraps sounds', async () => {
      http.get.mockResolvedValue(axiosResponse({ sounds: [{ id: 's1' }] }));

      const result = await service.getTrendingSounds({ limit: 2 });

      expect(http.get).toHaveBeenCalledWith('/sounds', {
        params: { limit: 2 },
      });
      expect(result).toEqual([{ id: 's1' }]);
    });
  });

  describe('discovery', () => {
    it('getTrendsDiscovery passes platform and refresh flags', async () => {
      const payload = {
        summary: {
          connectedPlatforms: ['tiktok'],
          lockedPlatforms: [],
          totalTrends: 1,
        },
        trends: [{ id: 'trend_1' }],
      };
      http.get.mockResolvedValue(axiosResponse(payload));

      const result = await service.getTrendsDiscovery({
        platform: 'tiktok',
        refresh: true,
      });

      expect(http.get).toHaveBeenCalledWith('/discovery', {
        params: { platform: 'tiktok', refresh: 'true' },
      });
      expect(result).toEqual(payload);
    });

    it('getTrendsDiscovery falls back to an empty summary', async () => {
      http.get.mockResolvedValue(axiosResponse(undefined));

      const result = await service.getTrendsDiscovery();

      expect(result).toEqual({
        summary: {
          connectedPlatforms: [],
          lockedPlatforms: [],
          totalTrends: 0,
        },
        trends: [],
      });
    });

    it('getCorpusFreshnessHealth reads the scheduled corpus status', async () => {
      const health = {
        generatedAt: '2026-08-31T08:05:00.000Z',
        providerFailures: [],
        segments: [],
        status: 'empty' as const,
        summary: {
          activeTrends: 0,
          failingProviders: 0,
          freshSegments: 0,
          platforms: [],
          referenceRecords: 0,
          staleSegments: 0,
          totalSegments: 0,
        },
      };
      http.get.mockResolvedValue(axiosResponse(health));

      const controller = new AbortController();
      const result = await service.getCorpusFreshnessHealth(controller.signal);

      expect(http.get).toHaveBeenCalledWith('/corpus/health', {
        signal: controller.signal,
      });
      expect(result).toEqual(health);
    });

    it('getTrendById GETs the trend detail', async () => {
      const detail = { id: 'trend_1', label: 'AI' };
      http.get.mockResolvedValue(axiosResponse(detail));

      const result = await service.getTrendById('trend_1');

      expect(http.get).toHaveBeenCalledWith('/trend_1');
      expect(result).toEqual(detail);
    });

    it('getTrendContent passes filters and falls back to empty items', async () => {
      http.get.mockResolvedValue(axiosResponse(undefined));

      const result = await service.getTrendContent({
        limit: 4,
        platform: 'youtube',
        refresh: true,
      });

      expect(http.get).toHaveBeenCalledWith('/content', {
        params: { limit: 4, platform: 'youtube', refresh: 'true' },
      });
      expect(result).toEqual({
        items: [],
        summary: {
          connectedPlatforms: [],
          lockedPlatforms: [],
          totalItems: 0,
          totalTrends: 0,
        },
      });
    });

    it('getTrendSources unwraps items with the default limit', async () => {
      http.get.mockResolvedValue(axiosResponse({ items: [{ id: 'src_1' }] }));

      const result = await service.getTrendSources('trend_1');

      expect(http.get).toHaveBeenCalledWith('/trend_1/sources', {
        params: { limit: 5 },
      });
      expect(result).toEqual([{ id: 'src_1' }]);
    });

    it('refreshTrends POSTs and falls back to a failure payload', async () => {
      http.post.mockResolvedValue(axiosResponse(undefined));

      const result = await service.refreshTrends();

      expect(http.post).toHaveBeenCalledWith('/refresh');
      expect(result).toEqual({
        count: 0,
        message: 'Refresh failed',
        success: false,
      });
    });

    it('getTurnoverStats GETs with the days window', async () => {
      const payload = {
        byPlatform: [],
        days: 7,
        timeline: [],
        totals: {
          alive: 0,
          appeared: 0,
          avgLifespanDays: 0,
          died: 0,
          turnoverRate: 0,
        },
      };
      http.get.mockResolvedValue(axiosResponse(payload));

      const result = await service.getTurnoverStats(7);

      expect(http.get).toHaveBeenCalledWith('/turnover', {
        params: { days: 7 },
      });
      expect(result).toEqual(payload);
    });
  });
});
