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

type Row = Record<string, unknown>;

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object') {
    if ('not' in expected) {
      return actual !== (expected as { not: unknown }).not;
    }
    return false;
  }
  return actual === expected;
}

function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) =>
    key === 'OR'
      ? (expected as Row[]).some((branch) => matchesWhere(row, branch))
      : matchesValue(row[key], expected),
  );
}

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

  const canonical: Row = {
    brandId: 'brand_genfeed',
    id: 'article_canonical',
    isDeleted: false,
    organizationId: 'org_genfeed',
    publishedAt: new Date('2025-01-01'),
    slug: 'pricing',
    status: 'PUBLISHED',
    userId: 'user_genfeed',
  };
  const draft: Row = {
    brandId,
    id: articleId,
    isDeleted: false,
    organizationId,
    publishedAt: null,
    slug: 'pricing',
    status: 'DRAFT',
    userId,
  };

  function buildService(rows: Row[]) {
    const table = rows.map((row) => ({ ...row }));
    const failures: { create?: Error; update?: Error } = {};

    const delegate = {
      create: async ({ data }: { data: Row }) => {
        if (failures.create) {
          throw failures.create;
        }
        const row = {
          isDeleted: false,
          ...data,
          id: `article_${table.length + 1}`,
        };
        table.push(row);
        return row;
      },
      findFirst: async ({ where = {} }: { where?: Row }) =>
        table.find((row) => matchesWhere(row, where)) ?? null,
      update: async ({ data, where }: { data: Row; where: Row }) => {
        if (failures.update) {
          throw failures.update;
        }
        const index = table.findIndex((row) => matchesWhere(row, where));
        table[index] = { ...(table[index] as Row), ...data };
        return table[index];
      },
    };

    const noop = () => undefined;
    const logger = {
      debug: noop,
      error: noop,
      log: noop,
      warn: noop,
    } as unknown as LoggerService;
    const configService = {
      get: () => 'https://genfeed.ai',
    } as unknown as ConfigService;

    const service = new ArticlesService(
      { article: delegate } as unknown as PrismaService,
      logger,
      configService,
      new ArticleVersionService(logger),
      new ArticleInsightsService(logger, configService),
      new ArticleRemixService(logger),
    );

    const stored = (id: string) => table.find((row) => row.id === id);
    return { failures, service, stored, table };
  }

  const publishedDto = {
    label: 'Pricing',
    slug: 'pricing',
    status: ArticleStatus.PUBLISHED,
    summary: 'Tenant page',
  } as CreateArticleDto;

  it('rejects creating a published article under a slug another organization holds', async () => {
    const { service, table } = buildService([canonical]);

    await expect(
      service.createArticle(publishedDto, userId, organizationId, brandId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(table).toEqual([canonical]);
  });

  it('allows draft articles to reuse a held slug', async () => {
    const { service, table } = buildService([canonical]);

    await service.createArticle(
      { ...publishedDto, status: ArticleStatus.DRAFT } as CreateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(table).toHaveLength(2);
    expect(table[1]).toEqual(
      expect.objectContaining({
        organizationId,
        slug: 'pricing',
        status: 'DRAFT',
      }),
    );
  });

  it('ignores a deleted article holding the slug', async () => {
    const { service, table } = buildService([
      { ...canonical, isDeleted: true },
    ]);

    await service.createArticle(publishedDto, userId, organizationId, brandId);

    expect(table[1]).toEqual(
      expect.objectContaining({ slug: 'pricing', status: 'PUBLISHED' }),
    );
  });

  it('rejects publishing a draft whose slug is held', async () => {
    const { service, stored } = buildService([canonical, draft]);

    await expect(
      service.update(
        articleId,
        { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
        userId,
        organizationId,
        brandId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(stored(articleId)?.status).toBe('DRAFT');
  });

  it('rejects renaming a published article onto a held slug', async () => {
    const { service, stored } = buildService([
      canonical,
      {
        ...draft,
        publishedAt: new Date('2026-01-01'),
        slug: 'my-own-page',
        status: 'PUBLISHED',
      },
    ]);

    await expect(
      service.update(
        articleId,
        { slug: 'pricing' } as UpdateArticleDto,
        userId,
        organizationId,
        brandId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stored(articleId)?.slug).toBe('my-own-page');
  });

  it('saves an already published article whose slug is unchanged', async () => {
    const { service, stored } = buildService([
      canonical,
      {
        ...draft,
        publishedAt: new Date('2026-01-01'),
        status: 'PUBLISHED',
      },
    ]);

    await service.update(
      articleId,
      { label: 'New label' } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(stored(articleId)?.label).toBe('New label');
  });

  it('publishes when the slug is free', async () => {
    const { service, stored } = buildService([draft]);

    await service.update(
      articleId,
      { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    expect(stored(articleId)?.status).toBe('PUBLISHED');
  });

  describe('a lost race on the unique index', () => {
    const violation = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['slug'] },
    });

    it('maps to 409 on create', async () => {
      const { failures, service } = buildService([]);
      failures.create = violation;

      await expect(
        service.createArticle(publishedDto, userId, organizationId, brandId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps to 409 on update', async () => {
      const { failures, service } = buildService([draft]);
      failures.update = violation;

      await expect(
        service.update(
          articleId,
          { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
          userId,
          organizationId,
          brandId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('does not mask unrelated database errors', async () => {
    const { failures, service } = buildService([]);
    failures.create = new Error('connection lost');

    await expect(
      service.createArticle(publishedDto, userId, organizationId, brandId),
    ).rejects.toThrow('connection lost');
  });
});
