import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleStatus } from '@genfeedai/enums';

describe('ArticleFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('buildArticleStatusFilter', () => {
    it('expands draft to include processing', () => {
      const stages = ArticleFilterUtil.buildArticleStatusFilter(
        ArticleStatus.DRAFT,
      );
      expect(stages).toHaveLength(1);
      expect(stages[0]).toEqual({
        match: {
          status: { in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING] },
        },
      });
    });

    it('accepts multiple statuses', () => {
      const stages = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.PUBLIC,
        ArticleStatus.DRAFT,
      ]);
      expect(stages[0].match.status.in).toEqual(
        expect.arrayContaining([
          ArticleStatus.DRAFT,
          ArticleStatus.PROCESSING,
          ArticleStatus.PUBLIC,
        ]),
      );
    });
  });

  describe('buildTagFilter', () => {
    it('returns ObjectId for valid tag', () => {
      const tagId = '507f191e810c19729de860ee';
      const filter = ArticleFilterUtil.buildTagFilter(tagId);
      expect(filter.tags).toBe(tagId);
    });

    it('returns empty object for invalid tag', () => {
      expect(ArticleFilterUtil.buildTagFilter('invalid')).toEqual({});
    });
  });

  describe('buildContentSearchFilter', () => {
    it('creates regex search across fields', () => {
      const stages = ArticleFilterUtil.buildContentSearchFilter(' marketing ');
      expect(stages).toHaveLength(1);
      expect(stages[0].match.OR).toHaveLength(3);
      expect(stages[0].match.OR[0].label.contains).toBe('marketing');
    });
  });

  describe('buildTagPopulation', () => {
    it('projects default and custom fields', () => {
      const stages = ArticleFilterUtil.buildTagPopulation(['slug']);
      const projectStage = stages[0].relationInclude.pipeline[0].select;
      expect(projectStage).toMatchObject({
        _id: 1,
        backgroundColor: 1,
        label: 1,
        slug: 1,
        textColor: 1,
      });
    });
  });

  describe('buildArticlePipeline', () => {
    it('composes pipeline with filters, lookups, and sorting', () => {
      const tag = '507f191e810c19729de860ee';
      const pipeline = ArticleFilterUtil.buildArticlePipeline(
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

      expect(pipeline[0].match.tags).toBe(tag);
      expect(
        pipeline.some(
          (stage) => 'match' in stage && stage.match?.category === 'blog',
        ),
      ).toBe(true);
      expect(
        pipeline.some(
          (stage) => 'match' in stage && stage.match?.scope === 'organization',
        ),
      ).toBe(true);
      const sortStage = pipeline[pipeline.length - 1];
      expect(sortStage.orderBy).toEqual({ label: 1 });
    });
  });
});
