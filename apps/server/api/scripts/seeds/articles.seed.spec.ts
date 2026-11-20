import type { PrismaClient } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';
import {
  assertArticleSchemaReady,
  buildBrandSelector,
  buildOrganizationSelector,
  countDeletedCacheKeys,
  getMissingArticleColumns,
  isLocalDatabaseUrl,
  parseArticlesSeedArgs,
  parseSlugList,
  REQUIRED_ARTICLE_COLUMNS,
  resolveSeedPublishedAt,
  runArticlesSeed,
  seedArticles,
  selectArticles,
} from './articles.seed';
import { HELP_ARTICLES } from './data/help-articles';
import { SEO_ARTICLES } from './data/seo-articles';

describe('articles seed schema preflight', () => {
  it('guards every physical column written by the launch seed', () => {
    expect(REQUIRED_ARTICLE_COLUMNS).toEqual([
      'coverImageUrl',
      'label',
      'summary',
    ]);
    expect(getMissingArticleColumns(['label', 'summary'])).toEqual([
      'coverImageUrl',
    ]);
  });

  it('fails closed before migration on a remote database', async () => {
    const migrateDeploy = vi.fn(() => true);

    await expect(
      assertArticleSchemaReady({
        findPresentColumns: async () => ['label', 'summary'],
        localDatabase: false,
        migrateDeploy,
      }),
    ).rejects.toThrow('coverImageUrl');
    expect(migrateDeploy).not.toHaveBeenCalled();
  });

  it('migrates a loopback database and verifies the schema again', async () => {
    const snapshots = [
      ['coverImageUrl'],
      ['coverImageUrl', 'label', 'summary'],
    ];
    const migrateDeploy = vi.fn(() => true);

    await expect(
      assertArticleSchemaReady({
        findPresentColumns: async () => snapshots.shift() ?? [],
        localDatabase: true,
        migrateDeploy,
      }),
    ).resolves.toBeUndefined();
    expect(migrateDeploy).toHaveBeenCalledOnce();
  });

  it('rejects a local schema that remains incomplete after migration', async () => {
    await expect(
      assertArticleSchemaReady({
        findPresentColumns: async () => ['coverImageUrl'],
        localDatabase: true,
        migrateDeploy: () => true,
      }),
    ).rejects.toThrow('still missing label, summary');
  });

  it('recognizes IPv4, hostname, and bracketed IPv6 loopback URLs only', () => {
    expect(isLocalDatabaseUrl('postgresql://localhost:5432/genfeed')).toBe(
      true,
    );
    expect(isLocalDatabaseUrl('postgresql://127.0.0.1:5432/genfeed')).toBe(
      true,
    );
    expect(isLocalDatabaseUrl('postgresql://[::1]:5432/genfeed')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://db.example.com:5432/genfeed')).toBe(
      false,
    );
    expect(isLocalDatabaseUrl('not a URL')).toBe(false);
  });

  it('constrains an explicit organization to the selected email owner', () => {
    expect(buildOrganizationSelector('org-1', 'genfeed.ai', 'user-1')).toEqual({
      id: 'org-1',
      isDeleted: false,
      label: { equals: 'genfeed.ai', mode: 'insensitive' },
      userId: 'user-1',
    });
    expect(buildOrganizationSelector('org-1', null, null)).toEqual({
      id: 'org-1',
      isDeleted: false,
    });
  });

  it('parses an explicit organization label and runtime validation mode', () => {
    expect(
      parseArticlesSeedArgs([
        '--env=production',
        '--ownerEmail=vincent@genfeed.ai',
        '--organizationLabel=genfeed.ai',
        '--validate-runtime',
      ]),
    ).toMatchObject({
      dryRun: true,
      env: 'production',
      organizationLabel: 'genfeed.ai',
      ownerEmail: 'vincent@genfeed.ai',
      validateRuntime: true,
    });
  });

  it('parses explicit brand ownership for reviewable seeded articles', () => {
    expect(
      parseArticlesSeedArgs([
        '--brandId=brand-1',
        '--brandSlug=genfeed',
        '--ownerEmail=vincent@genfeed.ai',
      ]),
    ).toMatchObject({
      brandId: 'brand-1',
      brandSlug: 'genfeed',
      ownerEmail: 'vincent@genfeed.ai',
    });

    expect(buildBrandSelector('brand-1', 'genfeed', 'org-1')).toEqual({
      id: 'brand-1',
      isActive: true,
      isDeleted: false,
      organizationId: 'org-1',
      slug: 'genfeed',
    });
  });

  it('refuses a production run that names no review brand, dry run included', async () => {
    const argv = process.argv;
    process.argv = [
      'bun',
      'articles.seed.ts',
      '--env=production',
      '--ownerEmail=owner@example.com',
    ];

    try {
      await expect(runArticlesSeed()).rejects.toThrow(
        'must name its review brand',
      );
    } finally {
      process.argv = argv;
    }
  });

  it('moves only the known launch batch timestamp to an editorial date', () => {
    const intended = new Date('2026-07-21T09:00:00.000Z');
    const originalBatch = new Date('2026-08-13T01:38:45.528Z');
    const manuallyEdited = new Date('2026-08-01T10:30:00.000Z');

    expect(
      resolveSeedPublishedAt({
        existingPublishedAt: originalBatch,
        intendedPublishedAt: intended,
        migrateFrom: originalBatch,
      }),
    ).toEqual(intended);
    expect(
      resolveSeedPublishedAt({
        existingPublishedAt: manuallyEdited,
        intendedPublishedAt: intended,
        migrateFrom: originalBatch,
      }),
    ).toEqual(manuallyEdited);
    expect(
      resolveSeedPublishedAt({
        existingPublishedAt: null,
        intendedPublishedAt: intended,
        migrateFrom: originalBatch,
      }),
    ).toEqual(intended);
  });

  it('counts only cache keys that Redis actually deleted', () => {
    expect(
      countDeletedCacheKeys(
        [
          [null, 1],
          [new Error('failed'), 0],
          [null, 0],
          [null, 1],
        ],
        3,
      ),
    ).toBe(1);
    expect(countDeletedCacheKeys(null, 3)).toBe(0);
  });
});

describe('articles seed selection', () => {
  it('parses --slugs into a trimmed, de-duplicated list', () => {
    expect(
      parseArticlesSeedArgs(['--slugs= a-guide , b-guide,a-guide,']).slugs,
    ).toEqual(['a-guide', 'b-guide']);
    expect(parseSlugList('')).toBeUndefined();
    expect(parseSlugList(' , ')).toBeUndefined();
    expect(parseSlugList(undefined)).toBeUndefined();
    expect(parseArticlesSeedArgs([]).slugs).toBeUndefined();
  });

  it('seeds only the help articles by default, create-only', () => {
    const { articles, overwrite } = selectArticles(undefined);
    expect(overwrite).toBe(false);
    expect(articles).toBe(HELP_ARTICLES);

    const seoSlugs = new Set(SEO_ARTICLES.map((article) => article.slug));
    expect(articles.some((article) => seoSlugs.has(article.slug))).toBe(false);
    expect(selectArticles([]).overwrite).toBe(false);
  });

  it('resolves named slugs from the bundled catalog and overwrites them', () => {
    const seo = SEO_ARTICLES[0].slug;
    const help = HELP_ARTICLES[0].slug;
    const { articles, overwrite } = selectArticles([seo, help]);
    expect(overwrite).toBe(true);
    expect(articles.map((article) => article.slug)).toEqual([seo, help]);
  });

  it('rejects slugs that are not in the catalog', () => {
    expect(() => selectArticles([SEO_ARTICLES[0].slug, 'nope', 'x'])).toThrow(
      /Unknown article slug\(s\): nope, x/,
    );
  });
});

describe('articles seed one-off publish shadow reclaim', () => {
  const seo = SEO_ARTICLES[0].slug;

  function buildPrisma() {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const count = vi.fn().mockResolvedValue(1);
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      article: {
        count,
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany,
        update: vi.fn().mockResolvedValue({}),
        updateMany,
      },
      brand: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'brand-1', label: 'Genfeed' }]),
      },
      organization: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'org-1', label: 'Genfeed.ai', userId: 'user-1' },
          ]),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }) },
    };
    return { prisma: prisma as unknown as PrismaClient, updateMany };
  }

  it('archives a foreign published article that holds a named slug', async () => {
    const { prisma, updateMany } = buildPrisma();
    await seedArticles(
      prisma,
      { brandSlug: 'genfeedai', dryRun: false, slugs: [seo] },
      { invalidateCache: vi.fn().mockResolvedValue(undefined) },
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      data: { status: 'ARCHIVED' },
      where: {
        organizationId: { not: 'org-1' },
        slug: seo,
        status: 'PUBLISHED',
      },
    });
  });

  it('leaves foreign articles alone on a dry run', async () => {
    const { prisma, updateMany } = buildPrisma();
    await seedArticles(
      prisma,
      { brandSlug: 'genfeedai', dryRun: true, slugs: [seo] },
      { invalidateCache: vi.fn().mockResolvedValue(undefined) },
    );
    expect(updateMany).not.toHaveBeenCalled();
  });
});
