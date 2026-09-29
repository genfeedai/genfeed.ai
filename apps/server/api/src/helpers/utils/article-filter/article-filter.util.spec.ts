import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTICLE_CREATE_UNKNOWN_PRISMA_FIELDS,
  ArticleFilterUtil,
} from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleStatus } from '@genfeedai/contracts';

const SERVER_SRC_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const API_SRC_ROOT = join(SERVER_SRC_ROOT, '../../api/src');
const ARTICLE_STATUS_GUARD_ROOTS = [
  join(SERVER_SRC_ROOT, 'collections/articles'),
  join(API_SRC_ROOT, 'endpoints/public'),
];
const FORBIDDEN_STATUS_FILTER_PATTERNS = [
  /where\s*:\s*{(?:[^{}]|{[^{}]*})*status\s*:\s*ArticleStatus\./gs,
  /where\.status\s*=\s*ArticleStatus\./g,
  /data\s*:\s*{(?:[^{}]|{[^{}]*})*status\s*:\s*ArticleStatus\./gs,
  /status\s*:\s*PrismaArticleStatus\./g,
  /where\.status\s*=\s*PrismaArticleStatus\./g,
];

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'dist' || entry === 'node_modules') continue;
    if (statSync(full).isDirectory()) {
      results.push(...walkSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      results.push(full);
    }
  }
  return results;
}

function hasForbiddenStatusFilter(source: string): boolean {
  return FORBIDDEN_STATUS_FILTER_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(source);
  });
}

describe('ArticleFilterUtil', () => {
  describe('toPrismaArticleStatus', () => {
    it('maps app statuses to persisted Prisma status values', () => {
      expect(ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.DRAFT)).toBe(
        'DRAFT',
      );
      expect(
        ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.PUBLISHED),
      ).toBe('PUBLISHED');
      expect(
        ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.ARCHIVED),
      ).toBe('ARCHIVED');
    });

    it('rejects transient statuses for persisted write data', () => {
      expect(() =>
        ArticleFilterUtil.toPersistedArticleStatus(ArticleStatus.PROCESSING),
      ).toThrow('cannot be persisted to Article.status');
    });

    it('strips unknown generate keys before Prisma create (#2859)', () => {
      expect(ARTICLE_CREATE_UNKNOWN_PRISMA_FIELDS).toEqual([
        'aiGeneration',
        'xArticleMetadata',
      ]);
      expect(
        ArticleFilterUtil.toArticlePersistenceData({
          aiGeneration: { prompt: 'Write about prompting' },
          content: '<p>Body</p>',
          label: 'Launch',
          status: ArticleStatus.DRAFT,
          summary: 'A draft',
          xArticleMetadata: { wordCount: 12 },
        }),
      ).toEqual({
        content: '<p>Body</p>',
        label: 'Launch',
        status: 'DRAFT',
        summary: 'A draft',
      });
    });
  });

  describe('buildArticleStatusFilter', () => {
    it('accepts multiple statuses and maps each', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.PUBLISHED,
        ArticleStatus.DRAFT,
      ]);
      expect(filter).toEqual({ status: { in: ['PUBLISHED', 'DRAFT'] } });
    });

    it('excludes unmappable values when mixed with valid ones', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.DRAFT,
        ArticleStatus.PROCESSING,
      ]);
      // processing has no Prisma equivalent — only DRAFT survives
      expect(filter).toEqual({ status: 'DRAFT' });
    });
  });

  describe('buildContentSearchFilter', () => {
    it('creates regex search across fields', () => {
      const filter = ArticleFilterUtil.buildContentSearchFilter(' marketing ');
      expect(filter.OR as unknown[]).toHaveLength(3);
      expect(
        (filter.OR as Array<{ label?: { contains: string } }>)[0].label
          ?.contains,
      ).toBe('marketing');
    });
  });

  describe('buildArticlequery', () => {
    it('composes query with filters, include, and sorting', () => {
      const tag = 'cltagarticle000000000000001';
      const query = ArticleFilterUtil.buildArticlequery(
        {
          category: 'blog',
          scope: 'organization',
          search: 'marketing',
          sortBy: 'label',
          sortDirection: 'asc',
          status: ArticleStatus.DRAFT,
          tag,
        },
        {
          isDeleted: false,
          organizationId: 'clorgarticle00000000000001',
        },
      );

      expect(query).toMatchObject({
        include: { tags: true },
        orderBy: { label: 1 },
        where: {
          category: 'blog',
          isDeleted: false,
          organizationId: 'clorgarticle00000000000001',
          scope: 'organization',
          status: 'DRAFT',
          tags: { some: { id: tag } },
        },
      });
      expect((query.where as { AND: unknown[] }).AND).toHaveLength(1);
    });

    it('omits status filter when all provided statuses are unmappable', () => {
      const query = ArticleFilterUtil.buildArticlequery(
        { status: ArticleStatus.PROCESSING },
        { isDeleted: false },
      );
      expect((query.where as Record<string, unknown>).status).toBeUndefined();
    });
  });

  describe('guard — ArticleStatus persistence boundary', () => {
    it('detects direct app status filters after nested where/data filters', () => {
      expect(
        hasForbiddenStatusFilter(
          'where: { publishedAt: { not: null }, status: ArticleStatus.PUBLISHED }',
        ),
      ).toBe(true);
      expect(
        hasForbiddenStatusFilter(
          'data: { metadata: { source: "rss" }, status: ArticleStatus.PUBLISHED }',
        ),
      ).toBe(true);
    });
  });
});
