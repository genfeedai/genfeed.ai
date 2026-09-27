import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { InsightsService } from '@services/analytics/insights.service';
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
