import { TemplateFilterUtil } from '@api/helpers/utils/template-filter/template-filter.util';

describe('TemplateFilterUtil', () => {
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

    it('passes through sort and limit (replaces GET /templates/popular)', () => {
      const filters = TemplateFilterUtil.buildTemplateFilters({
        limit: 20,
        sort: 'popular',
      });

      expect(filters).toEqual({
        limit: 20,
        sort: 'popular',
      });
    });

    it('omits sort/limit when not provided', () => {
      const filters = TemplateFilterUtil.buildTemplateFilters({
        purpose: 'content',
      });

      expect(filters.sort).toBeUndefined();
      expect(filters.limit).toBeUndefined();
    });
  });

  describe('buildArrayInFilter', () => {
    it('returns where fragment for provided values', () => {
      const filter = TemplateFilterUtil.buildArrayInFilter('industries', [
        'tech',
        'finance',
      ]);
      expect(filter).toEqual({
        industries: { in: ['tech', 'finance'] },
      });
    });

    it('returns empty object when values missing', () => {
      expect(
        TemplateFilterUtil.buildArrayInFilter('industries', undefined),
      ).toEqual({});
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

  describe('buildTemplateFilters', () => {
    it('keeps featured false when boolean provided', () => {
      expect(
        TemplateFilterUtil.buildTemplateFilters({ isFeatured: false }),
      ).toMatchObject({ isFeatured: false });
    });
  });
});
