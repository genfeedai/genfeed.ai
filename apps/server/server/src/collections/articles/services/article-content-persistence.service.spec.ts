import { ArticleCategory, ArticleStatus, TagCategory } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { ArticleContentPersistenceService } from '@server/collections/articles/services/article-content-persistence.service';
import type { TagsService } from '@server/collections/tags/services/tags.service';
import { describe, expect, it, vi } from 'vitest';

describe('ArticleContentPersistenceService', () => {
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
      const service = new ArticleContentPersistenceService(logger, tagsService);
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
