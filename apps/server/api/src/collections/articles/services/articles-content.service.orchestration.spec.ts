import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArticleGenerationType } from '@server/collections/articles/dto/generate-articles.dto';
import type { ArticleContentPersistenceService } from '@server/collections/articles/services/article-content-persistence.service';
import type { ArticleReviewService } from '@server/collections/articles/services/article-review.service';
import type { ArticleTextGenerationService } from '@server/collections/articles/services/article-text-generation.service';
import { ArticlesContentService } from '@server/collections/articles/services/articles-content.service';
import type { PersistGeneratedArticleParams } from '@server/collections/articles/services/articles-content.types';
import type { AccountPublishingContextService } from '@server/collections/credentials/services/account-publishing-context.service';
import type { TemplatesService } from '@server/collections/templates/services/templates.service';
import {
  ArticleCategory,
  ArticleStatus,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { AccountPublishingContext } from '@genfeedai/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for #3183: standard and X-article generation share one
 * prompt / model / review / tag / persistence orchestration path.
 */
describe('ArticlesContentService generation orchestration', () => {
  const userId = 'user_1';
  const organizationId = 'org_1';
  const brandId = 'brand_1';

  const modelConfig = {
    generationModel: 'test-generation-model',
    reviewModel: 'test-review-model',
    updateModel: 'test-update-model',
  };

  function countClassMethodLines(source: string, methodName: string): number {
    const lines = source.split('\n');
    const start = lines.findIndex((line) =>
      new RegExp(`^  (?:private |public )?(?:async )?${methodName}\\(`).test(
        line,
      ),
    );

    if (start < 0) {
      throw new Error(`Method ${methodName} not found`);
    }

    for (let index = start + 1; index < lines.length; index++) {
      if (lines[index] === '  }') {
        return index - start + 1;
      }
    }

    throw new Error(`Unclosed method ${methodName}`);
  }

  function makeService(params: {
    generationResponse?: unknown;
    generationText?: string;
    publishingContext?: AccountPublishingContext;
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
        .mockResolvedValue(
          params.generationText ?? JSON.stringify(params.generationResponse),
        ),
    } as unknown as ArticleTextGenerationService;

    const articleReviewService = {
      runReviewUpdateCycle: vi.fn().mockImplementation(({ draft }) =>
        Promise.resolve({
          updated: {
            content: `reviewed:${draft.content}`,
            label: `reviewed:${draft.label}`,
            summary: `reviewed:${draft.summary}`,
          },
        }),
      ),
    } as unknown as ArticleReviewService;

    const articleContentPersistenceService = {
      persistGeneratedArticle: vi.fn(
        async (persistParams: PersistGeneratedArticleParams) =>
          persistParams.createArticleFn(
            {
              category: persistParams.category,
              content: persistParams.draft.content,
              label: persistParams.draft.label,
              slug: persistParams.slug,
              status: ArticleStatus.DRAFT,
              summary: persistParams.draft.summary,
            },
            persistParams.userId,
            persistParams.organizationId,
            persistParams.brandId,
          ),
      ),
      updateArticleWithEnhancedContent: vi.fn(),
    } as unknown as ArticleContentPersistenceService;

    const templatesService = {
      getRenderedPrompt: vi.fn().mockResolvedValue('rendered prompt'),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    } as unknown as TemplatesService;

    const accountPublishingContextService = {
      resolve: vi.fn().mockResolvedValue(params.publishingContext),
    } as unknown as AccountPublishingContextService;

    const replicateService = {} as unknown as ReplicateService;

    const service = new ArticlesContentService(
      logger,
      configService,
      moduleRef,
      articleTextGenerationService,
      articleReviewService,
      articleContentPersistenceService,
      templatesService,
      undefined,
      undefined,
      undefined,
      undefined,
      accountPublishingContextService,
      replicateService,
    );

    const createArticleFn = vi.fn().mockResolvedValue({ id: 'article_1' });

    return {
      articleContentPersistenceService,
      articleReviewService,
      articleTextGenerationService,
      createArticleFn,
      logger,
      service,
      templatesService,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps public generation methods and shared orchestration below 150 lines', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'articles-content.service.ts',
      ),
      'utf8',
    );

    expect(countClassMethodLines(source, 'generateArticles')).toBeLessThan(150);
    expect(
      countClassMethodLines(source, 'generateLongFormArticle'),
    ).toBeLessThan(150);
    expect(
      countClassMethodLines(source, 'runArticleGenerationOrchestration'),
    ).toBeLessThan(150);
  });

  it('orchestrates standard article prompt, model, review, tags, and persistence', async () => {
    const {
      articleContentPersistenceService,
      articleReviewService,
      articleTextGenerationService,
      createArticleFn,
      service,
      templatesService,
    } = makeService({
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
    const onBilling = vi.fn();

    await service.generateArticles(
      { count: 1, prompt: 'write about growth' },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
      onBilling,
    );

    expect(templatesService.getRenderedPrompt).toHaveBeenCalledWith(
      PromptTemplateKey.ARTICLE_GENERATE,
      expect.objectContaining({
        count: 1,
        prompt: 'write about growth',
      }),
      organizationId,
    );
    expect(templatesService.updateMetadata).toHaveBeenCalledWith(
      PromptTemplateKey.ARTICLE_GENERATE,
      { incrementUsage: true },
    );
    expect(
      articleTextGenerationService.runTextGenerationStep,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        basePrompt: 'rendered prompt',
        buildPromptOptions: expect.objectContaining({
          promptTemplate: PromptTemplateKey.TEXT_ARTICLE,
          systemPromptTemplate: SystemPromptKey.ARTICLE,
          temperature: 0.8,
        }),
        model: 'test-generation-model',
        onBilling,
        organizationId,
      }),
    );
    expect(articleReviewService.runReviewUpdateCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: {
          content: '<p>Body</p>',
          label: 'Generated article',
          summary: 'Summary',
        },
        onBilling,
        organizationId,
        prompt: 'write about growth',
        type: ArticleGenerationType.STANDARD,
      }),
    );
    expect(
      articleContentPersistenceService.persistGeneratedArticle,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        category: ArticleCategory.POST,
        organizationId,
        slug: 'generated-article',
        tagLabels: ['Growth', 'AI', 'AI', '  '],
        userId,
        draft: {
          content: 'reviewed:<p>Body</p>',
          label: 'reviewed:Generated article',
          summary: 'reviewed:Summary',
        },
      }),
    );
    expect(createArticleFn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ArticleCategory.POST,
        status: ArticleStatus.DRAFT,
      }),
      userId,
      organizationId,
      brandId,
    );
  });

  it('orchestrates X-article prompt, model, review, tags, and persistence', async () => {
    const {
      articleContentPersistenceService,
      articleReviewService,
      articleTextGenerationService,
      createArticleFn,
      service,
      templatesService,
    } = makeService({
      generationResponse: {
        sections: [
          {
            content: '<p>Body</p>',
            heading: 'One',
            pullQuote: 'Quote',
          },
        ],
        slug: 'x-title',
        summary: 'Summary',
        tags: ['Growth', 'AI'],
        title: 'X Title',
      },
    });

    await service.generateLongFormArticle(
      {
        prompt: 'write a long brief',
        targetWordCount: 5000,
        tone: 'authoritative',
      },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
    );

    expect(templatesService.getRenderedPrompt).toHaveBeenCalledWith(
      PromptTemplateKey.X_ARTICLE_GENERATE,
      expect.objectContaining({
        prompt: 'write a long brief',
        targetWordCount: 5000,
        tone: 'authoritative',
      }),
      organizationId,
    );
    expect(
      articleTextGenerationService.runTextGenerationStep,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        buildPromptOptions: expect.objectContaining({
          promptTemplate: PromptTemplateKey.X_ARTICLE_GENERATE,
          systemPromptTemplate: SystemPromptKey.X_ARTICLE,
        }),
        model: 'test-generation-model',
        organizationId,
      }),
    );
    expect(articleReviewService.runReviewUpdateCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        prompt: 'write a long brief',
        type: ArticleGenerationType.X_ARTICLE,
      }),
    );
    expect(
      articleContentPersistenceService.persistGeneratedArticle,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        category: ArticleCategory.X_ARTICLE,
        organizationId,
        slug: 'x-title',
        tagLabels: ['Growth', 'AI'],
        userId,
        draft: expect.objectContaining({
          content: expect.stringContaining('<h2>One</h2>'),
          label: 'reviewed:X Title',
          summary: 'reviewed:Summary',
        }),
      }),
    );
    expect(createArticleFn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ArticleCategory.X_ARTICLE,
        status: ArticleStatus.DRAFT,
      }),
      userId,
      organizationId,
      brandId,
    );
  });

  it('appends X-article account publishing context to the generation prompt', async () => {
    const { articleTextGenerationService, createArticleFn, service } =
      makeService({
        generationResponse: {
          sections: [{ content: '<p>Body</p>', heading: 'One' }],
          title: 'X Title',
        },
        publishingContext: {
          constraints: { notes: ['keep it punchy'] },
          promptHints: ['voice: direct'],
        } as unknown as AccountPublishingContext,
      });

    await service.generateLongFormArticle(
      {
        credential: 'cred_1',
        prompt: 'write a long brief',
      },
      userId,
      organizationId,
      brandId,
      modelConfig,
      createArticleFn,
    );

    expect(
      articleTextGenerationService.runTextGenerationStep,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        basePrompt: expect.stringContaining('Account publishing context:'),
      }),
    );
    expect(
      articleTextGenerationService.runTextGenerationStep,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        basePrompt: expect.stringContaining('voice: direct'),
      }),
    );
  });

  it('rejects invalid generation JSON with the path-specific parse label', async () => {
    const { createArticleFn, logger, service } = makeService({
      generationText: 'not-json',
    });

    await expect(
      service.generateArticles(
        { count: 1, prompt: 'write about growth' },
        userId,
        organizationId,
        brandId,
        modelConfig,
        createArticleFn,
      ),
    ).rejects.toThrow('Invalid JSON response from AI service');

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to parse article generation JSON',
      expect.objectContaining({ responseText: 'not-json' }),
    );
  });
});
