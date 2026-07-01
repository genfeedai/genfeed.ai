import { describe, expect, it, vi } from 'vitest';

// `@genfeedai/prisma` re-exports the generated PrismaClient (packages/prisma/
// src/index.ts -> ../generated/prisma/client/client), which only exists after
// `prisma generate` runs and is heavy to load in a unit test (real driver
// adapter wiring). We can't use `vi.mock(..., async (importOriginal) => ...)`
// here because `importOriginal` evaluates that same generated-client
// re-export, which is unavailable/expensive in this environment. Instead we
// stub `PrismaClient` and inline the real `Article` entry from
// packages/prisma/src/enum-field-map.ts (PRISMA_MODEL_METADATA.Article) so
// BaseService's `getModelMeta('article')` call (base.service.ts) sees genuine
// field/enum metadata instead of throwing "no getModelMeta export".
vi.mock('@genfeedai/prisma', () => ({
  getModelMeta: (modelName: string) => {
    const pascal = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    const metadata: Record<
      string,
      {
        allFields: readonly string[];
        enumFields: Readonly<
          Record<string, { enumType: string; isRequired: boolean }>
        >;
      }
    > = {
      Article: {
        allFields: [
          'brand',
          'brandId',
          'category',
          'content',
          'coverImageUrl',
          'createdAt',
          'excerpt',
          'id',
          'isDeleted',
          'mongoId',
          'organization',
          'organizationId',
          'publishedAt',
          'scope',
          'seoBreakdown',
          'seoScore',
          'slug',
          'status',
          'title',
          'updatedAt',
          'user',
          'userId',
        ],
        enumFields: {
          status: { enumType: 'ArticleStatus', isRequired: true },
        },
      },
    };
    return metadata[pascal];
  },
  PrismaClient: class {},
}));

import type { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Focused coverage for the canonical article cache-key invalidation added in
 * #860: every write must bust `articles:list:{orgId}` + `articles:single:{id}`
 * and the shared `articles:*` pattern so HTTP @Cache responses can't go stale.
 */
describe('ArticlesService cache invalidation', () => {
  const organizationId = 'org_1';
  const userId = 'user_1';
  const brandId = 'brand_1';

  function buildService() {
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
      invalidatePattern: vi.fn().mockResolvedValue(undefined),
    } as unknown as CacheInvalidationService;

    const service = new ArticlesService(
      prisma,
      logger,
      { get: vi.fn() } as unknown as ConfigService,
      undefined, // replicateService
      undefined, // promptBuilderService
      undefined, // notificationsService
      undefined, // organizationSettingsService
      undefined, // promptsService
      undefined, // articlesContentService
      undefined, // templatesService
      cacheService,
      undefined, // articleAnalyticsService
      undefined, // usersService
      undefined, // organizationsService
      undefined, // creditsUtilsService
      undefined, // modelsService
      cacheInvalidationService,
    );

    return { cacheInvalidationService, delegate, service };
  }

  it('busts the org list key, the single key, and the articles:* pattern on create', async () => {
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
    expect(cacheInvalidationService.invalidatePattern).toHaveBeenCalledWith(
      'articles:*',
    );
  });

  it('busts the org list key, the single key, and the articles:* pattern on delete', async () => {
    const { cacheInvalidationService, delegate, service } = buildService();
    delegate.findFirst.mockResolvedValue({ id: 'article_2' });
    delegate.update.mockResolvedValue({ id: 'article_2', isDeleted: true });

    await service.removeArticle('article_2', userId, organizationId, brandId);

    expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
      `articles:list:${organizationId}`,
      'articles:single:article_2',
    );
    expect(cacheInvalidationService.invalidatePattern).toHaveBeenCalledWith(
      'articles:*',
    );
  });
});
