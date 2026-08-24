import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import type { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { TagsService } from '@api/collections/tags/services/tags.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ArticleCategory, ArticleStatus, TagCategory } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

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

  describe('persistGeneratedArticle', () => {
    const userId = 'user_1';
    const organizationId = 'org_1';
    const brandId = 'brand_1';

    function makeService(params?: {
      existingTagsByLabel?: Record<string, { id: string }>;
    }) {
      const logger = {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService;
      const moduleRef = {
        get: vi.fn(() => {
          throw new Error('not available');
        }),
      } as unknown as ModuleRef;
      let createdTagCount = 0;
      const tagsService = {
        create: vi.fn().mockImplementation(() => {
          createdTagCount += 1;
          return Promise.resolve({ id: `created-tag-${createdTagCount}` });
        }),
        findOne: vi
          .fn()
          .mockImplementation((where: Record<string, unknown>) => {
            const label = (where.label as { equals: string }).equals;
            return Promise.resolve(
              params?.existingTagsByLabel?.[label] ?? null,
            );
          }),
      } as unknown as TagsService;
      const service = new ArticleContentPersistenceService(
        logger,
        moduleRef,
        undefined,
        undefined,
        tagsService,
      );
      const createArticleFn = vi.fn().mockResolvedValue({ id: 'article_1' });

      return { createArticleFn, service, tagsService };
    }

    it('resolves generated tag labels with org scope and persists a draft', async () => {
      const { createArticleFn, service, tagsService } = makeService({
        existingTagsByLabel: { Growth: { id: 'existing-tag-1' } },
      });

      await service.persistGeneratedArticle({
        brandId,
        category: ArticleCategory.POST,
        createArticleFn,
        draft: {
          content: '<p>Body</p>',
          label: 'Generated article',
          summary: 'Summary',
        },
        organizationId,
        slug: 'generated-article',
        tagLabels: ['Growth', 'AI', 'AI', '  '],
        userId,
      });

      expect(tagsService.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        label: { equals: 'Growth', mode: 'insensitive' },
        organizationId,
      });
      expect(tagsService.create).toHaveBeenCalledTimes(1);
      expect(tagsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          category: TagCategory.ARTICLE,
          label: 'AI',
          organizationId,
          userId,
        }),
      );
      expect(createArticleFn).toHaveBeenCalledWith(
        {
          category: ArticleCategory.POST,
          content: '<p>Body</p>',
          label: 'Generated article',
          slug: 'generated-article',
          status: ArticleStatus.DRAFT,
          summary: 'Summary',
          tags: ['existing-tag-1', 'created-tag-1'],
        },
        userId,
        organizationId,
        brandId,
      );
    });

    it('omits tags from the payload when generation returns none', async () => {
      const { createArticleFn, service, tagsService } = makeService();

      await service.persistGeneratedArticle({
        brandId,
        category: ArticleCategory.X_ARTICLE,
        createArticleFn,
        draft: {
          content: '<p>Body</p>',
          label: 'X Title',
          summary: 'Summary',
        },
        organizationId,
        slug: 'x-title',
        userId,
      });

      expect(tagsService.findOne).not.toHaveBeenCalled();
      expect(createArticleFn).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ArticleCategory.X_ARTICLE,
          status: ArticleStatus.DRAFT,
        }),
        userId,
        organizationId,
        brandId,
      );
      const payload = createArticleFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(payload.tags).toBeUndefined();
    });

    it('still creates the article when tag resolution fails', async () => {
      const { createArticleFn, service, tagsService } = makeService();
      vi.mocked(tagsService.findOne).mockRejectedValue(new Error('db down'));

      await service.persistGeneratedArticle({
        brandId,
        category: ArticleCategory.POST,
        createArticleFn,
        draft: {
          content: '<p>Body</p>',
          label: 'Generated article',
          summary: 'Summary',
        },
        organizationId,
        slug: 'generated-article',
        tagLabels: ['AI'],
        userId,
      });

      expect(createArticleFn).toHaveBeenCalledTimes(1);
      const payload = createArticleFn.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(payload.tags).toBeUndefined();
    });
  });
});
