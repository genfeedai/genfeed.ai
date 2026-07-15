import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import type { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';

describe('ArticleContentPersistenceService', () => {
  it('persists enhanced content, version history, and completion status', async () => {
    const articlesService = {
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue({ id: 'article_1' }),
    } as unknown as ArticlesService;
    const promptsService = {
      create: vi.fn().mockResolvedValue({ id: 'prompt_1' }),
    } as unknown as PromptsService;
    const websocketService = {
      publishArticleStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsPublisherService;
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    } as unknown as LoggerService;
    const moduleRef = {
      get: vi.fn().mockReturnValue(articlesService),
    } as unknown as ModuleRef;
    const service = new ArticleContentPersistenceService(
      logger,
      moduleRef,
      promptsService,
      websocketService,
    );

    await service.updateArticleWithEnhancedContent(
      {
        content: 'Old body',
        id: 'article_1',
        label: 'Old title',
        slug: 'old-title',
        summary: 'Old summary',
      } as unknown as ArticleDocument,
      {
        content: 'New body',
        label: 'New title',
        slug: 'new-title',
        summary: 'New summary',
      },
      'Improve this article',
      undefined,
      'user_1',
      'org_1',
      'brand_1',
    );

    expect(articlesService.patch).toHaveBeenCalledWith(
      'article_1',
      expect.objectContaining({
        content: 'New body',
        label: 'New title',
        slug: 'new-title',
        summary: 'New summary',
      }),
    );
    expect(promptsService.create).toHaveBeenCalledTimes(1);
    expect(websocketService.publishArticleStatus).toHaveBeenCalledWith(
      'article_1',
      'completed',
      'user_1',
      expect.objectContaining({ label: 'New title' }),
    );
  });
});
