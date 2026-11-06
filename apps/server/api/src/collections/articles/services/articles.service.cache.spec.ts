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

interface ArticleQuery {
  orderBy?: unknown;
  where: Record<string, unknown>;
}

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
    options: {
      genfeedOrganization?: { id: string } | null;
      publicArticlesOrganizationId?: string;
      storedArticle?: Record<string, unknown> | null;
    } = {},
  ) {
    const reads: ArticleQuery[] = [];
    const organizationLookups: Array<Record<string, unknown>> = [];
    const invalidatedKeys: string[][] = [];
    const invalidatedTags: string[][] = [];

    const delegate = {
      create: async (input: { data: Record<string, unknown> }) => ({
        ...input.data,
        id: 'article_1',
      }),
      findFirst: async (query: ArticleQuery) => {
        reads.push(query);
        return options.storedArticle ?? null;
      },
      update: async (input: {
        data: Record<string, unknown>;
        where: { id: string };
      }) => ({ ...input.data, id: input.where.id }),
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

    const noop = () => undefined;
    const logger = {
      debug: noop,
      error: noop,
      log: noop,
      warn: noop,
    } as unknown as LoggerService;

    const cacheService = {
      invalidateByTags: async () => 0,
    } as unknown as CacheService;

    const cacheInvalidationService = {
      invalidate: async (...keys: string[]) => {
        invalidatedKeys.push(keys);
      },
      invalidateByTags: async (tags: string[]) => {
        invalidatedTags.push(tags);
        return 0;
      },
    } as unknown as CacheInvalidationService;

    const configService = {
      get: (key: string) =>
        key === 'PUBLIC_ARTICLES_ORGANIZATION_ID'
          ? options.publicArticlesOrganizationId
          : undefined,
    } as unknown as ConfigService;

    const organizationsService =
      options.genfeedOrganization === undefined
        ? undefined
        : ({
            findOne: async (where: Record<string, unknown>) => {
              organizationLookups.push(where);
              return options.genfeedOrganization;
            },
          } as unknown as OrganizationsService);

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
      organizationsService,
      cacheInvalidationService,
    );

    return {
      invalidatedKeys,
      invalidatedTags,
      organizationLookups,
      reads,
      service,
    };
  }

  it('binds a preview read to the signed article even when slugs collide', async () => {
    const { reads, service } = buildService();

    await service.findPublicArticleBySlug('shared-slug', 'article_2');

    expect(reads).toEqual([
      expect.objectContaining({
        where: {
          id: 'article_2',
          isDeleted: false,
          // No resolvable Genfeed organization: the read matches nothing.
          organizationId: { in: [] },
          slug: 'shared-slug',
        },
      }),
    ]);
  });

  it('keeps ordinary slug reads restricted to published articles', async () => {
    const { reads, service } = buildService();

    await service.findPublicArticleBySlug('shared-slug');

    expect(reads).toEqual([
      {
        // Deterministic: the earliest release wins if a legacy duplicate survives.
        orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        where: expect.objectContaining({
          isDeleted: false,
          publishedAt: { lte: expect.any(Date) },
          slug: 'shared-slug',
          status: 'PUBLISHED',
        }),
      },
    ]);
    expect(reads[0]?.where).not.toHaveProperty('id');
  });

  it('serves public slugs only from the Genfeed organization, resolved once', async () => {
    const { organizationLookups, reads, service } = buildService({
      genfeedOrganization: { id: 'org_genfeed' },
    });

    await service.findPublicArticleBySlug('shared-slug');
    await service.findPublicArticleBySlug('other-slug');

    expect(organizationLookups).toEqual([
      { isDeleted: false, slug: 'genfeedai' },
    ]);
    expect(reads.map((read) => read.where)).toEqual([
      expect.objectContaining({
        organizationId: 'org_genfeed',
        slug: 'shared-slug',
        status: 'PUBLISHED',
      }),
      expect.objectContaining({
        organizationId: 'org_genfeed',
        slug: 'other-slug',
      }),
    ]);
  });

  it('serves the configured organization id without a slug lookup, so a rename cannot unpublish the site', async () => {
    const { organizationLookups, service } = buildService({
      genfeedOrganization: null,
      publicArticlesOrganizationId: ' org_renamed ',
    });

    await expect(
      service.publicArticleScope.buildWhere(),
    ).resolves.toMatchObject({ organizationId: 'org_renamed' });
    await expect(
      service.publicArticleScope.isHostedOrganization('org_renamed'),
    ).resolves.toBe(true);
    await expect(
      service.publicArticleScope.isHostedOrganization('org_customer'),
    ).resolves.toBe(false);
    expect(organizationLookups).toEqual([]);
  });

  it('matches no tenant when the Genfeed organization cannot be resolved', async () => {
    const { service } = buildService({ genfeedOrganization: null });

    await expect(
      service.publicArticleScope.buildWhere(),
    ).resolves.toMatchObject({
      organizationId: { in: [] },
    });
    await expect(
      service.publicArticleScope.isHostedOrganization('org_customer'),
    ).resolves.toBe(false);
  });

  it('busts the org list key, the single key, and the articles tag on create', async () => {
    const { invalidatedKeys, invalidatedTags, service } = buildService();

    const dto = {
      category: 'POST',
      content: 'Body',
      label: 'Title',
      summary: '',
    } as unknown as CreateArticleDto;

    await service.createArticle(dto, userId, organizationId, brandId);

    expect(invalidatedKeys).toContainEqual([
      `articles:list:${organizationId}`,
      'articles:single:article_1',
    ]);
    expect(invalidatedTags).toContainEqual(['articles']);
  });

  it('busts the org list key, the single key, and the articles tag on delete', async () => {
    const { invalidatedKeys, invalidatedTags, service } = buildService({
      storedArticle: { id: 'article_2' },
    });

    await service.removeArticle('article_2', userId, organizationId, brandId);

    expect(invalidatedKeys).toContainEqual([
      `articles:list:${organizationId}`,
      'articles:single:article_2',
    ]);
    expect(invalidatedTags).toContainEqual(['articles']);
  });
});
