import type { IDateRange } from '@genfeedai/contracts/interfaces';
import {
  axiosResponse,
  collectionDocument,
  fetchResponse,
  installMockFetch,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  InsightsService,
  PredictiveAnalyticsService,
} from '@services/analytics/insights.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const insightAttributes = {
  category: 'engagement',
  confidence: 0.9,
  createdAt: '2026-01-01T00:00:00Z',
  description: 'Post more reels',
  impact: 'high',
  isRead: false,
  title: 'Reels perform best',
};

describe('InsightsService', () => {
  const token = 'insights-token';

  beforeEach(() => {
    InsightsService.clearInstance(token);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('caches instances per token and clears them', () => {
    const first = InsightsService.getInstance(token);
    expect(InsightsService.getInstance(token)).toBe(first);
    InsightsService.clearInstance(token);
    expect(InsightsService.getInstance(token)).not.toBe(first);
  });

  describe('getInsights', () => {
    it('GETs insights with the limit and maps to the frontend shape', async () => {
      const service = InsightsService.getInstance(token);
      const http = installMockHttp(service);
      http.get.mockResolvedValue(
        axiosResponse(
          collectionDocument([{ id: 'insight_1', ...insightAttributes }]),
        ),
      );

      const result = await service.getInsights(5);

      expect(http.get).toHaveBeenCalledWith('?limit=5', {
        signal: undefined,
      });
      expect(result).toEqual([
        {
          actionableSteps: [],
          category: 'engagement',
          confidence: 0.9,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          description: 'Post more reels',
          id: 'insight_1',
          impact: 'high',
          isRead: false,
          relatedMetrics: [],
          title: 'Reels perform best',
        },
      ]);
    });

    it('rethrows request failures', async () => {
      const service = InsightsService.getInstance(token);
      const http = installMockHttp(service);
      http.get.mockRejectedValue(new Error('boom'));

      await expect(service.getInsights()).rejects.toThrow('boom');
    });
  });

  describe('markAsRead', () => {
    it('PATCHes isRead and returns the deserialized resource', async () => {
      const service = InsightsService.getInstance(token);
      const http = installMockHttp(service);
      http.patch.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            { ...insightAttributes, isRead: true },
            { id: 'insight_1' },
          ),
        ),
      );

      const result = await service.markAsRead('insight_1');

      expect(http.patch).toHaveBeenCalledWith('insight_1', { isRead: true });
      expect(result).toMatchObject({ id: 'insight_1', isRead: true });
    });

    it('rethrows request failures', async () => {
      const service = InsightsService.getInstance(token);
      const http = installMockHttp(service);
      http.patch.mockRejectedValue(new Error('nope'));

      await expect(service.markAsRead('insight_1')).rejects.toThrow('nope');
    });
  });

  describe('markAsDismissed', () => {
    it('PATCHes isDismissed', async () => {
      const service = InsightsService.getInstance(token);
      const http = installMockHttp(service);
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument(insightAttributes, { id: 'insight_2' })),
      );

      const result = await service.markAsDismissed('insight_2');

      expect(http.patch).toHaveBeenCalledWith('insight_2', {
        isDismissed: true,
      });
      expect(result).toMatchObject({ id: 'insight_2' });
    });

    it('rethrows request failures', async () => {
      const service = InsightsService.getInstance(token);
      const http = installMockHttp(service);
      http.patch.mockRejectedValue(new Error('down'));

      await expect(service.markAsDismissed('insight_2')).rejects.toThrow(
        'down',
      );
    });
  });
});

describe('PredictiveAnalyticsService', () => {
  const token = 'predictive-token';
  let fetchMock: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    PredictiveAnalyticsService.clearInstance(token);
    fetchMock = installMockFetch();
    fetchMock.mockResolvedValue(fetchResponse({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('caches instances per token and clears them', () => {
    const first = PredictiveAnalyticsService.getInstance(token);
    expect(PredictiveAnalyticsService.getInstance(token)).toBe(first);
    PredictiveAnalyticsService.clearInstance(token);
    expect(PredictiveAnalyticsService.getInstance(token)).not.toBe(first);
  });

  it('getTrendForecasts GETs /predict/trends with metrics and period', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getTrendForecasts(['views', 'likes'], '7d');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/analytics/predict/trends?metrics=views,likes');
    expect(url).toContain('period=7d');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${token}`,
    );
  });

  it('getContentInsights includes only defined range bounds', async () => {
    const range: IDateRange = { end: '2026-02-01', start: '2026-01-01' };
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getContentInsights(range);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/analytics/insights?end=2026-02-01');
    expect(url).toContain('start=2026-01-01');
  });

  it('getContentInsights omits the query without a range', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getContentInsights();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.endsWith('/analytics/insights')).toBe(true);
  });

  it('getEngagementScore POSTs contentIds', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getEngagementScore(['c1', 'c2']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/analytics/engagement/score');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      contentIds: ['c1', 'c2'],
    });
  });

  it('getROIAnalysis GETs /roi with range params', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getROIAnalysis({ end: 'b', start: 'a' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/analytics/roi?end=b&start=a');
  });

  it('getAudienceInsights GETs /audience with platform', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getAudienceInsights('tiktok');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/analytics/audience?platform=tiktok');
  });

  it('getCompetitorAnalysis POSTs competitorIds', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getCompetitorAnalysis(['comp_1']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/analytics/competitors');
    expect(JSON.parse(init.body as string)).toEqual({
      competitorIds: ['comp_1'],
    });
  });

  it('getViralPrediction and predictViralPotential GET the viral endpoint', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getViralPrediction('content_1');
    await service.predictViralPotential('content_2');

    const [firstUrl] = fetchMock.mock.calls[0] as [string];
    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(firstUrl).toContain('/analytics/predict/viral/content_1');
    expect(secondUrl).toContain('/analytics/predict/viral/content_2');
  });

  it('getTopPatterns GETs /patterns/top with limit', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getTopPatterns(4);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/analytics/patterns/top?limit=4');
  });

  it('getContentGaps GETs /gaps', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.getContentGaps();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/analytics/gaps');
  });

  it('generateCustomReport POSTs the report config', async () => {
    const service = PredictiveAnalyticsService.getInstance(token);
    await service.generateCustomReport({ metrics: ['views'] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/analytics/reports/generate');
    expect(JSON.parse(init.body as string)).toEqual({ metrics: ['views'] });
  });

  it('throws the endpoint error message on non-ok responses', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

    const service = PredictiveAnalyticsService.getInstance(token);
    await expect(service.getContentGaps()).rejects.toThrow(
      'Failed to get content gaps',
    );
  });
});
