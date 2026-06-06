import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleStatus } from '@genfeedai/enums';

describe('ArticleFilterUtil', () => {
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
});
