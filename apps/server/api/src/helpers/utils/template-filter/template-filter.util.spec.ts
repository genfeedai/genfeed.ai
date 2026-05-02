import { TemplateFilterUtil } from '@api/helpers/utils/template-filter/template-filter.util';

describe('TemplateFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('buildTemplateFilters', () => {
    it('normalizes array fields and booleans', () => {
      const filters = TemplateFilterUtil.buildTemplateFilters({
        categories: 'ads',
        category: 'video',
        industry: 'marketing',
        isFeatured: 'true',
        key: 'system',
        platforms: ['instagram', 'tiktok'],
        purpose: 'prompt',
        scope: 'organization',
        search: 'hook',
      });

      expect(filters).toEqual({
        categories: ['ads'],
        category: 'video',
        industries: ['marketing'],
        isFeatured: true,
        key: 'system',
        platforms: ['instagram', 'tiktok'],
        purpose: 'prompt',
        scope: 'organization',
        search: 'hook',
      });
    });

    it('merges explicit industries/platform arrays', () => {
      const filters = TemplateFilterUtil.buildTemplateFilters({
        industries: ['tech', 'finance'],
        platform: 'youtube',
      });

      expect(filters.industries).toEqual(['tech', 'finance']);
      expect(filters.platforms).toEqual(['youtube']);
    });
  });

  describe('buildArrayInFilter', () => {
    it('returns match stage for provided values', () => {
      const stages = TemplateFilterUtil.buildArrayInFilter('industries', [
        'tech',
        'finance',
      ]);
      expect(stages).toHaveLength(1);
      expect(stages[0]).toEqual({
        match: { industries: { in: ['tech', 'finance'] } },
      });
    });

    it('returns empty array when values missing', () => {
      expect(
        TemplateFilterUtil.buildArrayInFilter('industries', undefined),
      ).toEqual([]);
    });
  });

  describe('parseFeaturedFilter', () => {
    it('parses strings safely', () => {
      expect(TemplateFilterUtil.parseFeaturedFilter('false')).toBe(false);
      expect(TemplateFilterUtil.parseFeaturedFilter('0')).toBe(false);
      expect(TemplateFilterUtil.parseFeaturedFilter('true')).toBe(true);
    });
  });

  describe('buildPurposeFilter & buildKeyFilter', () => {
    it('returns empty object when values missing', () => {
      expect(TemplateFilterUtil.buildPurposeFilter()).toEqual({});
      expect(TemplateFilterUtil.buildKeyFilter()).toEqual({});
    });

    it('returns filter when values provided', () => {
      expect(TemplateFilterUtil.buildPurposeFilter('content')).toEqual({
        purpose: 'content',
      });
      expect(TemplateFilterUtil.buildKeyFilter('system')).toEqual({
        key: 'system',
      });
    });
  });

  describe('buildTemplatePipeline', () => {
    it('composes pipeline with category, arrays, feature flag and search', () => {
      const baseMatch = { isDeleted: false, organization: 'org' };
      const query = {
        categories: ['ads'],
        category: 'video',
        industries: ['tech'],
        isFeatured: true,
        key: 'system',
        platforms: ['instagram'],
        purpose: 'prompt',
        scope: 'brand',
        search: 'hook',
      } as const;

      const pipeline = TemplateFilterUtil.buildTemplatePipeline(
        query,
        baseMatch,
      );

      expect(pipeline[0]).toEqual({
        match: {
          ...baseMatch,
          ...TemplateFilterUtil.buildPurposeFilter(query.purpose),
          ...TemplateFilterUtil.buildKeyFilter(query.key),
        },
      });

      const categoriesStage = pipeline.find(
        (stage) =>
          'match' in stage &&
          (
            stage as Record<string, unknown> & {
              match: Record<string, unknown>;
            }
          ).match?.categories,
      ) as Record<string, unknown> & { match: Record<string, unknown> };
      expect(categoriesStage.match?.categories).toEqual({
        in: ['ads'],
      });

      const scopeStage = pipeline.find(
        (stage) =>
          'match' in stage &&
          (
            stage as Record<string, unknown> & {
              match: Record<string, unknown>;
            }
          ).match?.scope,
      ) as Record<string, unknown> & { match: Record<string, unknown> };
      expect(scopeStage.match?.scope).toBe('brand');

      const searchStage = pipeline.find(
        (stage) =>
          'match' in stage &&
          (
            stage as Record<string, unknown> & {
              match: Record<string, unknown>;
            }
          ).match?.OR?.length === 3,
      ) as Record<string, unknown> & { match: Record<string, unknown> };
      expect(searchStage.match?.OR?.[0]?.label?.contains).toBe('hook');
    });

    it('adds featured filter when boolean provided', () => {
      const pipeline = TemplateFilterUtil.buildTemplatePipeline(
        { isFeatured: false },
        { isDeleted: false, organization: 'org' },
      );

      const featuredStage = pipeline.find(
        (stage) =>
          'match' in stage &&
          (
            stage as Record<string, unknown> & {
              match: Record<string, unknown>;
            }
          ).match?.isFeatured !== undefined,
      ) as Record<string, unknown> & { match: Record<string, unknown> };
      expect(featuredStage.match?.isFeatured).toBe(false);
    });
  });
});
