import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleStatus } from '@genfeedai/enums';

describe('ArticleFilterUtil', () => {
  describe('buildArticleStatusFilter', () => {
    it('expands draft to include processing', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.DRAFT,
      );
      expect(filter).toEqual({
        status: { in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING] },
      });
    });

    it('accepts multiple statuses', () => {
      const filter = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.PUBLIC,
        ArticleStatus.DRAFT,
      ]);
      expect((filter.status as { in: ArticleStatus[] }).in).toEqual(
        expect.arrayContaining([
          ArticleStatus.DRAFT,
          ArticleStatus.PROCESSING,
          ArticleStatus.PUBLIC,
        ]),
      );
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
          tags: { some: { id: tag } },
        },
      });
      expect((query.where as { AND: unknown[] }).AND).toHaveLength(1);
    });
  });
});
