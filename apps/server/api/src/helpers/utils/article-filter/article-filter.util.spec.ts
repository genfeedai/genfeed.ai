import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleStatus } from '@genfeedai/enums';
import { Types } from 'mongoose';

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
        $match: {
          status: { $in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING] },
        },
      });
    });

    it('accepts multiple statuses', () => {
      const stages = ArticleFilterUtil.buildArticleStatusFilter([
        ArticleStatus.PUBLIC,
        ArticleStatus.DRAFT,
      ]);
      expect(stages[0].$match.status.$in).toEqual(
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
      const tagId = new Types.ObjectId().toHexString();
      const filter = ArticleFilterUtil.buildTagFilter(tagId);
      expect(filter.tags.toHexString()).toBe(tagId);
    });

    it('returns empty object for invalid tag', () => {
      expect(ArticleFilterUtil.buildTagFilter('invalid')).toEqual({});
    });
  });

  describe('buildContentSearchFilter', () => {
    it('creates regex search across fields', () => {
      const stages = ArticleFilterUtil.buildContentSearchFilter(' marketing ');
      expect(stages).toHaveLength(1);
      expect(stages[0].$match.$or).toHaveLength(3);
      expect(stages[0].$match.$or[0].label.$regex).toBe('marketing');
    });
  });

  describe('buildTagPopulation', () => {
    it('projects default and custom fields', () => {
      const stages = ArticleFilterUtil.buildTagPopulation(['slug']);
      const projectStage = stages[0].$lookup.pipeline[0].$project;
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
      const tag = new Types.ObjectId().toHexString();
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
          organization: new Types.ObjectId(),
        },
      );

      expect(pipeline[0].$match.tags.toHexString()).toBe(tag);
      expect(
        pipeline.some(
          (stage) => '$match' in stage && stage.$match?.category === 'blog',
        ),
      ).toBe(true);
      expect(
        pipeline.some(
          (stage) =>
            '$match' in stage && stage.$match?.scope === 'organization',
        ),
      ).toBe(true);
      const sortStage = pipeline[pipeline.length - 1];
      expect(sortStage.$sort).toEqual({ label: 1 });
    });
  });
});
