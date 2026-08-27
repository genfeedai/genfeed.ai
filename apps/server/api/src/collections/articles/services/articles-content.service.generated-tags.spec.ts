import { ArticleContentPersistenceService } from '@server/collections/articles/services/article-content-persistence.service';
import type { ArticleReviewService } from '@server/collections/articles/services/article-review.service';
import type { ArticleTextGenerationService } from '@server/collections/articles/services/article-text-generation.service';
import { ArticlesContentService } from '@server/collections/articles/services/articles-content.service';
import type { TagsService } from '@server/collections/tags/services/tags.service';
import type { TemplatesService } from '@server/collections/templates/services/templates.service';
import { ArticleCategory, TagCategory } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the #2870 follow-up: the model generates `tags`
 * (labels, not ids) and the create path used to silently drop them. Generated
 * labels must be resolved to Tag ids (org-scoped find-or-create) and passed to
 * the create function so createArticle can connect them.
 */
describe('ArticlesContentService generated tags', () => {
  const userId = 'user_1';
  const organizationId = 'org_1';
  const brandId = 'brand_1';

  const modelConfig = {
    generationModel: 'test-model',
    reviewModel: 'test-model',
    updateModel: 'test-model',
  };

  function makeService(params: {
    generationResponse: unknown;
    existingTagsByLabel?: Record<string, { id: string }>;
  }) {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const configService = {
      get: vi.fn().mockReturnValue(4096),
    } as unknown as ConfigService;

    const moduleRef = {
      get: vi.fn(() => {
        throw new Error('not available');
      }),
    } as unknown as ModuleRef;

    const articleTextGenerationService = {
      runTextGenerationStep: vi
        .fn()
        .mockResolvedValue(JSON.stringify(params.generationResponse)),
    } as unknown as ArticleTextGenerationService;

    const articleReviewService = {
      runReviewUpdateCycle: vi.fn().mockImplementation(({ draft }) =>
        Promise.resolve({
          updated: {
            content: draft.content,
            label: draft.label,
            summary: draft.summary,
          },
        }),
      ),
    } as unknown as ArticleReviewService;

    const templatesService = {
      getRenderedPrompt: vi.fn().mockResolvedValue('rendered prompt'),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    } as unknown as TemplatesService;

    const replicateService = {} as unknown as ReplicateService;

    let createdTagCount = 0;
    const tagsService = {
      create: vi.fn().mockImplementation(() => {
        createdTagCount += 1;
        return Promise.resolve({ id: `created-tag-${createdTagCount}` });
      }),
      findOne: vi.fn().mockImplementation((where: Record<string, unknown>) => {
        const label = (where.label as { equals: string }).equals;
        return Promise.resolve(params.existingTagsByLabel?.[label] ?? null);
      }),
    } as unknown as TagsService;

    const articleContentPersistenceService =
      new ArticleContentPersistenceService(
        logger,
        moduleRef,
        undefined,
        undefined,
        tagsService,
      );

    const service = new ArticlesContentService(
      logger,
      configService,
      moduleRef,
      articleTextGenerationService,
      articleReviewService,
      articleContentPersistenceService,
      templatesService,
      undefined, // brandsService
      undefined, // personasService
      undefined, // contentHarnessService
      undefined, // harnessProfilesService
      undefined, // accountPublishingContextService
      replicateService,
    );

    const createArticleFn = vi.fn().mockResolvedValue({ id: 'article_1' });

    return { createArticleFn, service, tagsService };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves generated tag labels to ids and passes them to the create payload', async () => {
    const { createArticleFn, service, tagsService } = makeService({
      existingTagsByLabel: { Growth: { id: 'existing-tag-1' } },
      generationResponse: {
        articles: [
          {
            content: '<p>Body</p>',
            label: 'Generated article',
            slug: 'generated-article',
            summary: 'Summary',
            tags: ['Growth', 'AI', 'AI', '  '],
          },
        ],
      },
    });

    await service.generateArticles(
      { count: 1, prompt: 'write about growth' },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
    );

    // 'Growth' resolves to the existing tag; 'AI' is deduped and created once;
    // the blank entry is dropped.
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
      expect.objectContaining({
        label: 'Generated article',
        tags: ['existing-tag-1', 'created-tag-1'],
      }),
      userId,
      organizationId,
      brandId,
    );
  });

  it('omits tags from the payload when generation returns none', async () => {
    const { createArticleFn, service, tagsService } = makeService({
      generationResponse: {
        articles: [
          {
            content: '<p>Body</p>',
            label: 'Generated article',
            slug: 'generated-article',
            summary: 'Summary',
          },
        ],
      },
    });

    await service.generateArticles(
      { count: 1, prompt: 'write about growth' },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
    );

    expect(tagsService.findOne).not.toHaveBeenCalled();
    const payload = createArticleFn.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.tags).toBeUndefined();
  });

  it('still creates the article when tag resolution fails', async () => {
    const { createArticleFn, service, tagsService } = makeService({
      generationResponse: {
        articles: [
          {
            content: '<p>Body</p>',
            label: 'Generated article',
            slug: 'generated-article',
            summary: 'Summary',
            tags: ['AI'],
          },
        ],
      },
    });
    vi.mocked(tagsService.findOne).mockRejectedValue(new Error('db down'));

    await service.generateArticles(
      { count: 1, prompt: 'write about growth' },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
    );

    expect(createArticleFn).toHaveBeenCalledTimes(1);
    const payload = createArticleFn.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.tags).toBeUndefined();
  });

  it('resolves generated tag labels on the X-article path', async () => {
    const { createArticleFn, service, tagsService } = makeService({
      existingTagsByLabel: { Growth: { id: 'existing-tag-1' } },
      generationResponse: {
        sections: [{ content: '<p>Body</p>', heading: 'One' }],
        slug: 'x-title',
        summary: 'Summary',
        tags: ['Growth', 'AI'],
        title: 'X Title',
      },
    });

    await service.generateLongFormArticle(
      { prompt: 'write a long brief' },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
    );

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
      expect.objectContaining({
        category: ArticleCategory.X_ARTICLE,
        tags: ['existing-tag-1', 'created-tag-1'],
      }),
      userId,
      organizationId,
      brandId,
    );
  });
});
