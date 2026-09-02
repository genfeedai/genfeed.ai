import type { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ArticleInsightsService', () => {
  it('normalizes and delegates performance metrics', async () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const analytics = {
      updatePerformanceMetrics: vi.fn().mockResolvedValue(undefined),
    } as unknown as ArticleAnalyticsService;
    const service = new ArticleInsightsService(
      logger,
      {} as ConfigService,
      undefined,
      undefined,
      undefined,
      analytics,
    );

    await service.updatePerformanceMetrics('article_1', {
      clickThroughRate: 0.25,
      comments: 4,
      likes: 8,
      shares: 2,
      views: 100,
    });

    expect(analytics.updatePerformanceMetrics).toHaveBeenCalledWith(
      'article_1',
      {
        clickThroughRate: 0.25,
        comments: 4,
        likes: 8,
        shares: 2,
        views: 100,
      },
    );
  });
});
