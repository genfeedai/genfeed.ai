import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleStatus } from '@genfeedai/enums';

const API_SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ARTICLE_STATUS_GUARD_ROOTS = [
  join(API_SRC_ROOT, 'collections/articles'),
  join(API_SRC_ROOT, 'endpoints/public'),
];
const PRISMA_ARTICLE_STATUS_MEMBERS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

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

describe('ArticleFilterUtil', () => {
  describe('toPrismaArticleStatus', () => {
    it('maps app statuses to persisted Prisma status values', () => {
      expect(ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.DRAFT)).toBe(
        'DRAFT',
      );
      expect(
        ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.PUBLIC),
      ).toBe('PUBLISHED');
      expect(
        ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.ARCHIVED),
      ).toBe('ARCHIVED');
    });

    it('passes already-persisted Prisma status values through', () => {
      expect(ArticleFilterUtil.toPrismaArticleStatus('PUBLISHED')).toBe(
        'PUBLISHED',
      );
    });

    it('does not map transient generation statuses to Article.status', () => {
      expect(
        ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.PROCESSING),
      ).toBeUndefined();
      expect(
        ArticleFilterUtil.toPrismaArticleStatus(ArticleStatus.FAILED),
      ).toBeUndefined();
    });

    it('rejects transient statuses for persisted write data', () => {
      expect(() =>
        ArticleFilterUtil.toPersistedArticleStatus(ArticleStatus.PROCESSING),
      ).toThrow('cannot be persisted to Article.status');
    });

    it('maps write data through the same boundary', () => {
      expect(
        ArticleFilterUtil.toArticlePersistenceData({
          label: 'Launch',
          status: ArticleStatus.PUBLIC,
        }),
      ).toEqual({ label: 'Launch', status: 'PUBLISHED' });
    });

    it('builds the canonical public persisted status filter', () => {
      expect(ArticleFilterUtil.buildPublicArticleStatusFilter()).toEqual({
        status: 'PUBLISHED',
      });
    });
  });

  describe('buildArticleStatusFilter', () => {
    it('maps draft to Prisma DRAFT', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.DRAFT,
      );
      expect(filter).toEqual({ status: 'DRAFT' });
    });

    it('maps public to Prisma PUBLISHED', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.PUBLIC,
      );
      expect(filter).toEqual({ status: 'PUBLISHED' });
    });

    it('maps archived to Prisma ARCHIVED', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.ARCHIVED,
      );
      expect(filter).toEqual({ status: 'ARCHIVED' });
    });

    it('drops processing (no Prisma equivalent)', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.PROCESSING,
      );
      expect(filter).toEqual({});
    });

    it('drops failed (no Prisma equivalent)', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.FAILED,
      );
      expect(filter).toEqual({});
    });

    it('accepts multiple statuses and maps each', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.PUBLIC,
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

    it('returns empty object when all statuses are unmappable', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.PROCESSING,
        ArticleStatus.FAILED,
      ]);
      expect(filter).toEqual({});
    });
  });

  describe('buildTagFilter', () => {
    it('returns Prisma m2m relation filter for valid tag', () => {
      const tagId = '507f191e810c19729de860ee';
      const filter = ArticleFilterUtil.buildTagFilter(tagId);
      expect(filter).toEqual({ tags: { some: { id: tagId } } });
    });

    it('returns empty object for invalid tag', () => {
      expect(ArticleFilterUtil.buildTagFilter('invalid')).toEqual({});
    });
  });

  describe('buildContentSearchFilter', () => {
    it('creates regex search across fields', () => {
      const filter = ArticleFilterUtil.buildContentSearchFilter(' marketing ');
      expect(filter.OR as unknown[]).toHaveLength(3);
      expect(
        (filter.OR as Array<{ title?: { contains: string } }>)[0].title
          ?.contains,
      ).toBe('marketing');
    });
  });

  describe('buildTagPopulation', () => {
    it('includes tags', () => {
      expect(ArticleFilterUtil.buildTagPopulation()).toEqual({
        include: { tags: true },
      });
    });
  });

  describe('buildArticlequery', () => {
    it('composes query with filters, include, and sorting', () => {
      const tag = '507f191e810c19729de860ee';
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
          organization: '507f191e810c19729de860ee',
        },
      );

      expect(query).toMatchObject({
        include: { tags: true },
        orderBy: { label: 1 },
        where: {
          category: 'blog',
          isDeleted: false,
          organization: '507f191e810c19729de860ee',
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
    it('keeps every persisted app status mapped to a valid Prisma ArticleStatus member', () => {
      const prismaStatusSet = new Set(PRISMA_ARTICLE_STATUS_MEMBERS);
      for (const status of [
        ArticleStatus.DRAFT,
        ArticleStatus.PUBLIC,
        ArticleStatus.ARCHIVED,
      ]) {
        const prismaStatus = ArticleFilterUtil.toPersistedArticleStatus(status);
        expect(
          prismaStatusSet.has(prismaStatus),
          `${status} mapped to ${prismaStatus}, which is not a Prisma ArticleStatus member`,
        ).toBe(true);
      }
    });

    it('does not use app ArticleStatus values directly in Prisma where/data status filters', () => {
      const forbiddenPatterns = [
        /where\s*:\s*{[^}]*status\s*:\s*ArticleStatus\./gs,
        /where\.status\s*=\s*ArticleStatus\./g,
        /data\s*:\s*{[^}]*status\s*:\s*ArticleStatus\./gs,
        /status\s*:\s*PrismaArticleStatus\./g,
        /where\.status\s*=\s*PrismaArticleStatus\./g,
      ];
      const violations: string[] = [];

      for (const filePath of ARTICLE_STATUS_GUARD_ROOTS.flatMap((root) =>
        walkSourceFiles(root),
      )) {
        const source = readFileSync(filePath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          pattern.lastIndex = 0;
          if (pattern.test(source)) {
            violations.push(relative(API_SRC_ROOT, filePath));
            break;
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
