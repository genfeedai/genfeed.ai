import type { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
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

    await service.updatePerformanceMetrics('article_1', 'org_1', {
      clickThroughRate: 0.25,
      comments: 4,
      likes: 8,
      shares: 2,
      views: 100,
    });

    expect(analytics.updatePerformanceMetrics).toHaveBeenCalledWith(
      'article_1',
      'org_1',
      {
        clickThroughRate: 0.25,
        comments: 4,
        likes: 8,
        shares: 2,
        views: 100,
      },
    );
  });

  describe('analyzeVirality (#5375 BYOK threading)', () => {
    const validAiResponse = JSON.stringify({
      factors: {},
      predictions: {},
      suggestions: [],
      viralityScore: 80,
    });

    function buildService(): {
      service: ArticleInsightsService;
      replicateService: {
        generateTextCompletionSync: ReturnType<typeof vi.fn>;
      };
    } {
      const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService;
      const replicateService = {
        generateTextCompletionSync: vi.fn().mockResolvedValue(validAiResponse),
      };
      const promptBuilderService = {
        buildPrompt: vi.fn().mockResolvedValue({ input: { prompt: 'test' } }),
      };
      const templatesService = {
        getRenderedPrompt: vi.fn().mockResolvedValue('rendered prompt'),
      };
      const service = new ArticleInsightsService(
        logger,
        {} as ConfigService,
        replicateService as unknown as ReplicateService,
        promptBuilderService as never,
        templatesService as never,
        undefined,
      );
      return { replicateService, service };
    }

    it('forwards a resolved BYOK key to the completion call', async () => {
      const { service, replicateService } = buildService();
      const findArticle = vi.fn().mockResolvedValue({
        category: 'blog',
        content: 'content',
        id: 'article_1',
        label: 'Title',
        summary: 'summary',
      });
      const patchArticle = vi.fn().mockResolvedValue(undefined);

      await service.analyzeVirality(
        'article_1',
        'user_1',
        'org_1',
        findArticle,
        patchArticle,
        'org-openrouter-key',
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'org-openrouter-key',
      );
    });

    it('dispatches with no key override when the guard did not bypass', async () => {
      const { service, replicateService } = buildService();
      const findArticle = vi.fn().mockResolvedValue({
        category: 'blog',
        content: 'content',
        id: 'article_1',
        label: 'Title',
        summary: 'summary',
      });
      const patchArticle = vi.fn().mockResolvedValue(undefined);

      await service.analyzeVirality(
        'article_1',
        'user_1',
        'org_1',
        findArticle,
        patchArticle,
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        undefined,
      );
    });
  });
});
