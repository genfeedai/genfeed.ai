import { describe, expect, it, vi } from 'vitest';

// `@genfeedai/prisma` re-exports the generated PrismaClient (packages/prisma/
// src/index.ts -> ../generated/prisma/client/client), which only exists after
// `prisma generate` runs and is heavy to load in a unit test (real driver
// adapter wiring). canonicalPrismaMock() spreads the real, schema-derived
// getModelMeta/PRISMA_MODEL_METADATA (from the light @genfeedai/prisma/testing
// subpath) so BaseService's `getModelMeta('article')` call (base.service.ts)
// sees genuine field/enum metadata without ever importing the heavy client.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Focused coverage for the canonical article cache-key invalidation added in
 * #860: every write must bust `articles:list:{orgId}` + `articles:single:{id}`
 * and the shared `articles` tag so HTTP @Cache responses can't go stale —
 * without ever walking the keyspace with SCAN (#2518).
 */
describe('ArticlesService cache invalidation', () => {
  const organizationId = 'org_1';
  const userId = 'user_1';
  const brandId = 'brand_1';

  function buildService(
    options: { organizationsService?: OrganizationsService } = {},
  ) {
    const delegate = {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    };

    const prisma = {
      _runtimeDataModel: {
        models: {
          Article: {
            fields: [
              { name: 'id' },
              { name: 'userId' },
              { name: 'organizationId' },
              { name: 'brandId' },
              { name: 'isDeleted' },
              { name: 'category' },
              { name: 'content' },
              { name: 'label' },
              { name: 'summary' },
            ],
          },
        },
      },
      article: delegate,
    } as unknown as PrismaService;

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const cacheService = {
      invalidateByTags: vi.fn().mockResolvedValue(0),
    } as unknown as CacheService;

    const cacheInvalidationService = {
      invalidate: vi.fn().mockResolvedValue(undefined),
      invalidateByTags: vi.fn().mockResolvedValue(0),
    } as unknown as CacheInvalidationService;

    const configService = {
      get: vi.fn(),
    } as unknown as ConfigService;

    const service = new ArticlesService(
      prisma,
      logger,
      configService,
      new ArticleVersionService(logger),
      new ArticleInsightsService(logger, configService),
      new ArticleRemixService(logger),
      undefined, // notificationsService
      undefined, // organizationSettingsService
      undefined, // articlesContentService
      cacheService,
      undefined, // usersService
      options.organizationsService,
      cacheInvalidationService,
    );

    return { cacheInvalidationService, delegate, service };
  }

  it('binds a preview read to the signed article even when slugs collide', async () => {
    const { delegate, service } = buildService();
    delegate.findFirst.mockResolvedValue(null);
    await service.findPublicArticleBySlug('shared-slug', 'article_2');
    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'article_2',
          isDeleted: false,
          // No resolvable Genfeed organization: the read matches nothing.
          organizationId: { in: [] },
          slug: 'shared-slug',
        },
      }),
    );
  });

  it('keeps ordinary slug reads restricted to published articles', async () => {
    const { delegate, service } = buildService();
    delegate.findFirst.mockResolvedValue(null);
    await service.findPublicArticleBySlug('shared-slug');
    expect(delegate.findFirst).toHaveBeenCalledWith({
      // Deterministic: the earliest release wins if a legacy duplicate survives.
      orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      where: expect.objectContaining({
        isDeleted: false,
        slug: 'shared-slug',
        status: 'PUBLISHED',
        publishedAt: { lte: expect.any(Date) },
      }),
    });
    expect(delegate.findFirst.mock.calls[0][0].where).not.toHaveProperty('id');
  });

  it('serves public slugs only from the Genfeed organization', async () => {
    const organizationsService = {
      findOne: vi.fn().mockResolvedValue({ id: 'org_genfeed' }),
    } as unknown as OrganizationsService;
    const { delegate, service } = buildService({ organizationsService });
    delegate.findFirst.mockResolvedValue(null);

    await service.findPublicArticleBySlug('shared-slug');
    await service.findPublicArticleBySlug('other-slug');

    expect(organizationsService.findOne).toHaveBeenCalledTimes(1);
    expect(organizationsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      slug: 'genfeed',
    });
    expect(delegate.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_genfeed',
      slug: 'shared-slug',
      status: 'PUBLISHED',
    });
  });

  it('matches no tenant when the Genfeed organization cannot be resolved', async () => {
    const organizationsService = {
      findOne: vi.fn().mockResolvedValue(null),
    } as unknown as OrganizationsService;
    const { service } = buildService({ organizationsService });

    await expect(service.buildPublicArticleWhere()).resolves.toMatchObject({
      organizationId: { in: [] },
    });
    await expect(
      service.isPublicArticlesOrganization('org_customer'),
    ).resolves.toBe(false);
  });

  it('busts the org list key, the single key, and the articles tag on create', async () => {
    const { cacheInvalidationService, delegate, service } = buildService();
    delegate.create.mockResolvedValue({ id: 'article_1' });

    const dto = {
      category: 'POST',
      content: 'Body',
      label: 'Title',
      summary: '',
    } as unknown as CreateArticleDto;

    await service.createArticle(dto, userId, organizationId, brandId);

    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      `articles:list:${organizationId}`,
      'articles:single:article_1',
    );
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
      'articles',
    ]);
  });

  it('busts the org list key, the single key, and the articles tag on delete', async () => {
    const { cacheInvalidationService, delegate, service } = buildService();
    delegate.findFirst.mockResolvedValue({ id: 'article_2' });
    delegate.update.mockResolvedValue({ id: 'article_2', isDeleted: true });

    await service.removeArticle('article_2', userId, organizationId, brandId);

    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      `articles:list:${organizationId}`,
      'articles:single:article_2',
    );
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
      'articles',
    ]);
  });
});
