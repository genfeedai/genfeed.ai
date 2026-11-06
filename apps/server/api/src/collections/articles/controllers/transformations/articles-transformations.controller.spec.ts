import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticlesTransformationsController } from '@api/collections/articles/controllers/transformations/articles-transformations.controller';
import type { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import type { ByokService } from '@api/services/byok/byok.service';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import type { RouterService } from '@api/services/router/router.service';
import type { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { ByokProvider } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

const articleId = testId('article');
const organizationId = testId('org');
const otherOrganizationId = testId('org', 2);
const brandId = testId('brand');
const userId = testId('user');

const user = {
  brandId,
  id: 'user_123',
  organizationId,
  userId,
} as unknown as User;

const request = { originalUrl: '/api/articles', query: {} } as Request;

interface ArticleRow {
  brandId: string | null;
  generationPrompt?: string;
  id: string;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  seoScore?: number;
  summary: string;
  userId: string;
}

type Where = Record<string, unknown>;

/** Prisma `where` over scalar columns and `OR`. */
function matches(row: ArticleRow, where: Where): boolean {
  return Object.entries(where).every(([key, value]) =>
    key === 'OR'
      ? (value as Where[]).some((clause) => matches(row, clause))
      : row[key as keyof ArticleRow] === value,
  );
}

const article = (overrides: Partial<ArticleRow> = {}): ArticleRow => ({
  brandId,
  id: articleId,
  isDeleted: false,
  label: 'Test Article',
  organizationId,
  summary: 'A test article summary',
  userId,
  ...overrides,
});

/**
 * In-memory articles table behind the article and SEO services, brand and
 * organization generation defaults, and the system default models. Article
 * reads pass through the CLOUD tenant guard. The article service's text
 * operations answer with the actor, tenant and BYOK dispatch they ran as.
 */
function setup({
  articles = [article()],
  brandDefaults = {} as Record<string, string>,
  organizationDefaults = {} as Record<string, string>,
} = {}) {
  const asActor = (
    operation: string,
    id: string,
    actorId: string,
    orgId: string,
    extra: unknown,
  ) => {
    if (
      !articles.some((row) => row.id === id && row.organizationId === orgId)
    ) {
      throw new NotFoundException('Article', id);
    }
    return { actorId, extra, id, operation, orgId };
  };
  const articlesService = {
    analyzeVirality: async (
      id: string,
      actorId: string,
      orgId: string,
      _brand: string,
      apiKey?: string,
    ) => asActor('virality', id, actorId, orgId, apiKey ?? null),
    convertToTwitterThread: async (
      id: string,
      actorId: string,
      orgId: string,
      brand: string,
    ) => asActor('thread', id, actorId, orgId, brand),
    findAll: async (query: { where: Where }) => {
      assertTenantScopedQuery({
        args: query,
        isCloud: true,
        model: 'Article',
        operation: 'findMany',
        tenantModelNames: new Set(['Article']),
      });
      return {
        docs: articles
          .filter((row) => matches(row, query.where))
          .map((row) => ({ ...row })),
      };
    },
    findOne: async (where: Where) =>
      articles.find((row) => matches(row, where)) ?? null,
    generateHeaderPrompt: async (
      id: string,
      actorId: string,
      orgId: string,
      dispatch: unknown,
    ) => asActor('prompt', id, actorId, orgId, dispatch ?? null),
  };
  const seoScorer = {
    scoreArticle: async (id: string, orgId: string, keyword: string) => {
      const row = articles.find(
        (item) => item.id === id && item.organizationId === orgId,
      );
      if (row) row.seoScore = keyword.length * 9;
    },
  };
  const brandsService = {
    findOne: async (where: { id: string; organizationId: string }) =>
      where.id === brandId && where.organizationId === organizationId
        ? brandDefaults
        : null,
  };
  const organizationSettings = {
    findOneSelect: async () => organizationDefaults,
  };
  const router = {
    getDefaultModel: async (category: string) => `system-${category}`,
  };
  const silent = () => undefined;
  const controller = new ArticlesTransformationsController(
    articlesService as unknown as ArticlesService,
    brandsService as unknown as BrandsService,
    { error: silent, log: silent } as unknown as LoggerService,
    organizationSettings as unknown as OrganizationSettingsService,
    router as unknown as RouterService,
    seoScorer as unknown as SeoScorerService,
    new TextGenerationCreditsService({} as ByokService),
  );
  return { articles, controller };
}

const inTenant = <T>(work: () => Promise<T>) =>
  runWithTenantContext({ organizationId }, work);

describe('ArticlesTransformationsController', () => {
  it('converts the article to a thread as the caller in their organization and brand', async () => {
    const { controller } = setup();

    await expect(controller.convertToThread(articleId, user)).resolves.toEqual({
      actorId: userId,
      extra: brandId,
      id: articleId,
      operation: 'thread',
      orgId: organizationId,
    });
  });

  it.each([
    ['without a BYOK key', {}, null],
    [
      'with the guard-resolved BYOK key (#5375)',
      { creditsConfig: { byokApiKeyOverride: 'org-openrouter-key' } },
      'org-openrouter-key',
    ],
  ])('analyzes virality %s', async (_name, extra, key) => {
    const { controller } = setup();

    const result = await controller.analyzeVirality(articleId, user, {
      ...request,
      ...extra,
    } as unknown as Request);

    expect(result).toMatchObject({
      actorId: userId,
      extra: key,
      operation: 'virality',
      orgId: organizationId,
    });
  });

  describe('generatePrompt', () => {
    it('opts into the OpenRouter BYOK bypass that its dispatch honours', () => {
      expect(
        Reflect.getMetadata(
          CREDITS_KEY,
          ArticlesTransformationsController.prototype.generatePrompt,
        ),
      ).toMatchObject({
        allowByokBypass: true,
        provider: ByokProvider.OPENROUTER,
      });
    });

    it.each([
      ['on platform credits', {}, null],
      [
        'as a BYOK dispatch with the guard-resolved key',
        {
          creditsConfig: {
            byokApiKeyOverride: 'org-or-key',
            isByokBypass: true,
            provider: ByokProvider.OPENROUTER,
          },
        },
        { keys: { [ByokProvider.OPENROUTER]: 'org-or-key' } },
      ],
    ])('generates the header prompt %s', async (_name, extra, dispatch) => {
      const { controller } = setup();

      const result = await controller.generatePrompt(
        extra as unknown as Request,
        articleId,
        user,
      );

      expect(result).toEqual({
        prompt: {
          actorId: userId,
          extra: dispatch,
          id: articleId,
          operation: 'prompt',
          orgId: organizationId,
        },
      });
    });
  });

  describe('scoreSeo', () => {
    it('scores the article and returns the refreshed record', async () => {
      const { articles, controller } = setup();

      const result = await inTenant(() =>
        controller.scoreSeo(
          request,
          articleId,
          { targetKeyword: 'ai content' },
          user,
        ),
      );

      expect(articles[0].seoScore).toBe(90);
      expect(result).toMatchObject({
        data: { attributes: { seoScore: 90 }, id: articleId },
      });
    });

    it.each([
      ['missing', []],
      ['deleted', [article({ isDeleted: true })]],
      [
        'in another organization',
        [article({ organizationId: otherOrganizationId })],
      ],
    ])(
      'answers 404 without scoring an article that is %s',
      async (_name, articles) => {
        const { controller } = setup({ articles });

        await expect(
          inTenant(() =>
            controller.scoreSeo(
              request,
              articleId,
              { targetKeyword: 'ai content' },
              user,
            ),
          ),
        ).rejects.toThrow(HttpException);
        expect(articles[0]?.seoScore).toBeUndefined();
      },
    );
  });

  describe('media configuration', () => {
    it.each([
      [
        'the explicit model',
        { model: 'explicit-model' },
        { defaultImageModel: 'brand-model' },
        'explicit-model',
      ],
      [
        'the brand default',
        {},
        { defaultImageModel: 'brand-model' },
        'brand-model',
      ],
      ['the system default', {}, {}, 'system-image'],
    ])('picks %s for an image', async (_name, body, brandDefaults, model) => {
      const { controller } = setup({ brandDefaults });

      await expect(
        controller.generateImageFromArticle(articleId, body, user),
      ).resolves.toEqual({
        config: { height: 1024, model, width: 1024 },
        prompt: 'A test article summary',
      });
    });

    it('prefers the generation prompt and the organization default for a video', async () => {
      const { controller } = setup({
        articles: [article({ generationPrompt: 'A cinematic header' })],
        organizationDefaults: { defaultVideoModel: 'org-video-model' },
      });

      await expect(
        controller.generateVideoFromArticle(articleId, { duration: 5 }, user),
      ).resolves.toEqual({
        config: { duration: 5, model: 'org-video-model' },
        prompt: 'A cinematic header',
      });
    });

    it('answers 404 for an article outside the caller and organization', async () => {
      const { controller } = setup({
        articles: [
          article({ organizationId: otherOrganizationId, userId: 'someone' }),
        ],
      });

      await expect(
        controller.generateImageFromArticle(articleId, {}, user),
      ).rejects.toThrow(HttpException);
    });
  });
});
