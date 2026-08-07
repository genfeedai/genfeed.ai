import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPromptPerformance,
  getTopPerformers,
  getWeeklySummary,
} from '../../src/api/performance';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

function requestedPath(): string {
  return mockFetch.mock.calls[0][0] as string;
}

function requestedQuery(): URLSearchParams {
  return new URLSearchParams(requestedPath().split('?')[1] ?? '');
}

describe('api/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('getWeeklySummary', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            avgEngagementByContentType: [],
            avgEngagementByPlatform: [
              { avgEngagementRate: 3.1, platform: 'twitter', totalPosts: 4 },
            ],
            bestPostingTimes: [],
            topHooks: ['A strong hook'],
            topPerformers: [],
            weekOverWeekTrend: {
              currentEngagement: 3.6,
              direction: 'up',
              percentageChange: 12.5,
              previousEngagement: 3.2,
            },
            worstPerformers: [],
          },
          id: 'performance-summary',
          type: 'performance-summary',
        },
      });
    });

    it('sends the query parameter names the controller reads', async () => {
      await getWeeklySummary({
        brandId: 'brand-1',
        endDate: '2026-01-07',
        startDate: '2026-01-01',
        topN: 3,
        worstN: 2,
      });

      const query = requestedQuery();
      expect(requestedPath()).toContain('/content-performance/summary/weekly?');
      expect(query.get('brandId')).toBe('brand-1');
      expect(query.get('topN')).toBe('3');
      expect(query.get('worstN')).toBe('2');
      expect(query.get('startDate')).toBe('2026-01-01');
      expect(query.get('endDate')).toBe('2026-01-07');
    });

    it('never sends the legacy parameter names that returned 400', async () => {
      await getWeeklySummary({
        brandId: 'brand-1',
        endDate: '2026-01-07',
        startDate: '2026-01-01',
        topN: 3,
        worstN: 2,
      });

      const query = requestedQuery();
      for (const legacy of ['brand', 'top', 'worst', 'start', 'end']) {
        expect(query.has(legacy)).toBe(false);
      }
    });

    it('omits optional parameters but always sends brandId', async () => {
      await getWeeklySummary({ brandId: 'brand-1' });

      const query = requestedQuery();
      expect(query.get('brandId')).toBe('brand-1');
      expect(query.has('topN')).toBe(false);
      expect(query.has('worstN')).toBe(false);
      expect(query.has('startDate')).toBe(false);
      expect(query.has('endDate')).toBe(false);
    });

    it('flattens the JSON:API summary payload', async () => {
      const summary = await getWeeklySummary({ brandId: 'brand-1' });

      expect(summary.weekOverWeekTrend.direction).toBe('up');
      expect(summary.weekOverWeekTrend.currentEngagement).toBe(3.6);
      expect(summary.avgEngagementByPlatform[0].platform).toBe('twitter');
      expect(summary.topHooks).toEqual(['A strong hook']);
    });
  });

  describe('getTopPerformers', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue([
        {
          comments: 3,
          description: 'A post',
          engagementRate: 4.2,
          likes: 34,
          platform: 'twitter',
          postId: 'post-1',
          saves: 1,
          shares: 5,
          title: 'Post one',
          views: 1200,
        },
      ]);
    });

    it('sends brandId, limit and the date range the controller reads', async () => {
      await getTopPerformers({
        brandId: 'brand-1',
        endDate: '2026-01-07',
        limit: 5,
        startDate: '2026-01-01',
      });

      const query = requestedQuery();
      expect(requestedPath()).toContain('/content-performance/summary/top-performers?');
      expect(query.get('brandId')).toBe('brand-1');
      expect(query.get('limit')).toBe('5');
      expect(query.get('startDate')).toBe('2026-01-01');
      expect(query.get('endDate')).toBe('2026-01-07');
      expect(query.has('brand')).toBe(false);
      expect(query.has('start')).toBe(false);
      expect(query.has('end')).toBe(false);
    });

    it('returns the plain array the controller responds with', async () => {
      const items = await getTopPerformers({ brandId: 'brand-1' });

      expect(items).toHaveLength(1);
      expect(items[0].postId).toBe('post-1');
      expect(items[0].engagementRate).toBe(4.2);
      expect(items[0].views).toBe(1200);
    });
  });

  describe('getPromptPerformance', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue([
        {
          avgEngagementRate: 5.5,
          promptSnippet: 'Behind the scenes of',
          totalPosts: 4,
          totalViews: 900,
        },
      ]);
    });

    it('sends brandId and the date range the controller reads', async () => {
      await getPromptPerformance({
        brandId: 'brand-1',
        endDate: '2026-01-07',
        startDate: '2026-01-01',
      });

      const query = requestedQuery();
      expect(requestedPath()).toContain('/content-performance/summary/prompt-performance?');
      expect(query.get('brandId')).toBe('brand-1');
      expect(query.get('startDate')).toBe('2026-01-01');
      expect(query.get('endDate')).toBe('2026-01-07');
      expect(query.has('brand')).toBe(false);
    });

    it('returns the plain array the controller responds with', async () => {
      const prompts = await getPromptPerformance({ brandId: 'brand-1' });

      expect(prompts).toHaveLength(1);
      expect(prompts[0].promptSnippet).toBe('Behind the scenes of');
      expect(prompts[0].totalPosts).toBe(4);
    });
  });
});
