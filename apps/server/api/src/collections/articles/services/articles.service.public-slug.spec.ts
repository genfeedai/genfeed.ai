import { describe, expect, it, vi } from 'vitest';

// See articles.service.cache.spec.ts: the generated Prisma client is heavy, so
// canonicalPrismaMock() supplies the schema-derived model metadata instead.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import type { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ArticleStatus } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';

/**
 * #5904: public article slugs are one global namespace. Publishing a second
 * live article under a held slug must be rejected, including when the check
 * races and the partial unique index fires instead.
 */
describe('ArticlesService public slug uniqueness', () => {
  const organizationId = 'org_tenant';
  const userId = 'user_1';
  const brandId = 'brand_1';
  const articleId = 'article_tenant';

  type Row = Record<string, unknown>;

  function buildService(options: { holder?: Row | null; current?: Row } = {}) {
    const holder = options.holder === undefined ? null : options.holder;
    const current: Row = options.current ?? {
      id: articleId,
      organizationId,
      publishedAt: null,
      slug: 'pricing',
      status: 'DRAFT',
      userId,
    };

    const delegate = {
      create: vi.fn().mockResolvedValue({ id: articleId }),
      findFirst: vi.fn(async ({ where }: { where?: Row }) =>
        where?.status === 'PUBLISHED' && where?.slug ? holder : current,
      ),
      update: vi.fn().mockResolvedValue({
        id: articleId,
        isDeleted: false,
        organizationId,
        slug: 'pricing',
        userId,
      }),
    };

    const prisma = {
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

    const service = new ArticlesService(
      prisma,
      logger,
      configService,
      new ArticleVersionService(logger),
      new ArticleInsightsService(logger, configService),
      new ArticleRemixService(logger),
    );

    return { delegate, service };
  }

  const publishedDto = {
    label: 'Pricing',
    slug: 'pricing',
    status: ArticleStatus.PUBLISHED,
    summary: 'Tenant page',
  } as CreateArticleDto;

  it('rejects creating a published article under a held slug', async () => {
    const { delegate, service } = buildService({
      holder: { id: 'article_canonical' },
    });

    await expect(
      service.createArticle(publishedDto, userId, organizationId, brandId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(delegate.create).not.toHaveBeenCalled();
    expect(delegate.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { isDeleted: false, slug: 'pricing', status: 'PUBLISHED' },
    });
  });

  it('allows draft articles to reuse a held slug', async () => {
    const { delegate, service } = buildService({
      holder: { id: 'article_canonical' },
    });

    await service.createArticle(
      { ...publishedDto, status: ArticleStatus.DRAFT } as CreateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(delegate.create).toHaveBeenCalled();
  });

  it('rejects publishing a draft whose slug is held', async () => {
    const { delegate, service } = buildService({
      holder: { id: 'article_canonical' },
    });

    await expect(
      service.update(
        articleId,
        { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
        userId,
        organizationId,
        brandId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(delegate.update).not.toHaveBeenCalled();
    expect(delegate.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: { not: articleId },
        isDeleted: false,
        slug: 'pricing',
        status: 'PUBLISHED',
      },
    });
  });

  it('rejects renaming a published article onto a held slug', async () => {
    const { delegate, service } = buildService({
      current: {
        id: articleId,
        organizationId,
        publishedAt: new Date('2026-01-01'),
        slug: 'my-own-page',
        status: 'PUBLISHED',
        userId,
      },
      holder: { id: 'article_canonical' },
    });

    await expect(
      service.update(
        articleId,
        { slug: 'pricing' } as UpdateArticleDto,
        userId,
        organizationId,
        brandId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('does not re-check an already published article saved without changing slug', async () => {
    const { delegate, service } = buildService({
      current: {
        id: articleId,
        organizationId,
        publishedAt: new Date('2026-01-01'),
        slug: 'pricing',
        status: 'PUBLISHED',
        userId,
      },
      holder: { id: 'itself-would-conflict' },
    });

    await service.update(
      articleId,
      { label: 'New label' } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(delegate.update).toHaveBeenCalled();
  });

  it('publishes when the slug is free', async () => {
    const { delegate, service } = buildService({ holder: null });

    await service.update(
      articleId,
      { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(delegate.update).toHaveBeenCalled();
  });

  it.each([
    ['create', 'create'],
    ['update', 'update'],
  ] as const)(
    'maps a lost race on the unique index to 409 on %s',
    async (operation) => {
      const { delegate, service } = buildService({ holder: null });
      const violation = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['slug'] },
      });
      delegate[operation].mockRejectedValue(violation);

      const attempt =
        operation === 'create'
          ? service.createArticle(publishedDto, userId, organizationId, brandId)
          : service.update(
              articleId,
              { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
              userId,
              organizationId,
              brandId,
            );

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('does not mask unrelated database errors', async () => {
    const { delegate, service } = buildService({ holder: null });
    delegate.create.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.createArticle(publishedDto, userId, organizationId, brandId),
    ).rejects.toThrow('connection lost');
  });
});
