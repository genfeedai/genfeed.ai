import { describe, expect, it, vi } from 'vitest';

// See articles.service.cache.spec.ts — `@genfeedai/prisma` re-exports the
// generated client, which only exists after `prisma generate` and is heavy to
// load. canonicalPrismaMock() supplies the real schema-derived model metadata
// BaseService needs without importing the client.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { CacheService } from '@api/services/cache/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ArticleScope, ArticleStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Regression coverage for the #2485 review finding: `ArticleFilterUtil`
 * normalizes legacy status input (`public`, lowercase spellings) to the
 * persisted `PUBLISHED` label, but the update flow used to branch on the *raw*
 * DTO status. A legacy update therefore persisted `PUBLISHED` while skipping
 * every publication side effect — no `scope`, no `publishedAt`, no Discord
 * notification — producing an article that reads as published but was never
 * actually published.
 *
 * @see https://github.com/genfeedai/genfeed.ai/pull/2485#discussion_r3737427643
 */
describe('ArticlesService publish-state transition', () => {
  const organizationId = 'org_1';
  const userId = 'user_1';
  const brandId = 'brand_1';
  const articleId = 'article_1';

  function buildService() {
    const delegate = {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({
        id: articleId,
        organizationId,
        publishedAt: null,
        userId,
      }),
      update: vi.fn().mockResolvedValue({
        id: articleId,
        isDeleted: false,
        label: 'Title',
        organizationId,
        slug: 'a-slug',
        userId,
      }),
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
              { name: 'label' },
              { name: 'publishedAt' },
              { name: 'scope' },
              { name: 'slug' },
              { name: 'status' },
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

    const configService = {
      get: vi.fn().mockReturnValue('https://genfeed.ai'),
    } as unknown as ConfigService;

    const notificationsService = {
      sendArticleNotification: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;

    const organizationSettingsService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ isNotificationsDiscordEnabled: true }),
    } as unknown as OrganizationSettingsService;

    const cacheService = {
      invalidateByTags: vi.fn().mockResolvedValue(0),
    } as unknown as CacheService;

    const cacheInvalidationService = {
      invalidate: vi.fn().mockResolvedValue(undefined),
      invalidateByTags: vi.fn().mockResolvedValue(0),
    } as unknown as CacheInvalidationService;

    const service = new ArticlesService(
      prisma,
      logger,
      configService,
      new ArticleVersionService(logger),
      new ArticleInsightsService(logger, configService),
      new ArticleRemixService(logger),
      notificationsService,
      organizationSettingsService,
      undefined, // articlesContentService
      cacheService,
      undefined, // usersService
      undefined, // organizationsService
      cacheInvalidationService,
    );

    return { delegate, notificationsService, service };
  }

  function readPatchedData(delegate: { update: ReturnType<typeof vi.fn> }) {
    const call = delegate.update.mock.calls.at(-1)?.[0] as
      | { data?: Record<string, unknown> }
      | undefined;
    return call?.data ?? {};
  }

  it('applies the publish transition for canonical PUBLISHED input', async () => {
    const { delegate, notificationsService, service } = buildService();

    await service.update(
      articleId,
      { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    const data = readPatchedData(delegate);
    expect(data.status).toBe('PUBLISHED');
    expect(data.scope).toBe(ArticleScope.PUBLIC);
    expect(data.publishedAt).toBeDefined();
    expect(notificationsService.sendArticleNotification).toHaveBeenCalledTimes(
      1,
    );
  });

  it('applies the same publish transition for legacy `public` input', async () => {
    const { delegate, notificationsService, service } = buildService();

    await service.update(
      articleId,
      { status: 'public' } as unknown as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    const data = readPatchedData(delegate);
    // The legacy value normalizes to PUBLISHED on write, so every publication
    // side effect must fire — persisting PUBLISHED without them is the bug.
    expect(data.status).toBe('PUBLISHED');
    expect(data.scope).toBe(ArticleScope.PUBLIC);
    expect(data.publishedAt).toBeDefined();
    expect(notificationsService.sendArticleNotification).toHaveBeenCalledTimes(
      1,
    );
  });

  it('leaves publication side effects untouched for a draft update', async () => {
    const { delegate, notificationsService, service } = buildService();

    await service.update(
      articleId,
      { status: ArticleStatus.DRAFT } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    const data = readPatchedData(delegate);
    expect(data.status).toBe('DRAFT');
    expect(data.scope).toBeUndefined();
    expect(data.publishedAt).toBeUndefined();
    expect(notificationsService.sendArticleNotification).not.toHaveBeenCalled();
  });

  it('leaves publication side effects untouched when no status is supplied', async () => {
    const { delegate, notificationsService, service } = buildService();

    await service.update(
      articleId,
      { label: 'Renamed' } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    const data = readPatchedData(delegate);
    expect(data.scope).toBeUndefined();
    expect(data.publishedAt).toBeUndefined();
    expect(notificationsService.sendArticleNotification).not.toHaveBeenCalled();
  });
});
