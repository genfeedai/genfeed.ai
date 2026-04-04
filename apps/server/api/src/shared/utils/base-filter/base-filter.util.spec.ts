import { BaseFilterUtil } from '@api/shared/utils/base-filter/base-filter.util';
import { describe, expect, it } from 'vitest';

describe('BaseFilterUtil', () => {
  describe('buildArrayInFilter', () => {
    it('returns empty array for undefined values', () => {
      const result = BaseFilterUtil.buildArrayInFilter('field', undefined);
      expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const result = BaseFilterUtil.buildArrayInFilter('field', '');
      expect(result).toEqual([]);
    });

    it('builds $in filter for single value', () => {
      const result = BaseFilterUtil.buildArrayInFilter('industries', 'tech');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ $match: { industries: { $in: ['tech'] } } });
    });

    it('builds $in filter for array of values', () => {
      const result = BaseFilterUtil.buildArrayInFilter('platforms', [
        'twitter',
        'instagram',
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        $match: { platforms: { $in: ['twitter', 'instagram'] } },
      });
    });

    it('returns empty array for empty array', () => {
      const result = BaseFilterUtil.buildArrayInFilter('field', []);
      expect(result).toEqual([]);
    });
  });

  describe('parseBooleanFilter', () => {
    it('returns true for "true" string', () => {
      expect(BaseFilterUtil.parseBooleanFilter('true')).toBe(true);
    });

    it('returns false for "false" string', () => {
      expect(BaseFilterUtil.parseBooleanFilter('false')).toBe(false);
    });

    it('returns undefined for undefined input', () => {
      expect(BaseFilterUtil.parseBooleanFilter(undefined)).toBeUndefined();
    });

    it('returns boolean as-is', () => {
      expect(BaseFilterUtil.parseBooleanFilter(true)).toBe(true);
      expect(BaseFilterUtil.parseBooleanFilter(false)).toBe(false);
    });
  });

  describe('buildSearchFilter', () => {
    it('returns empty array for empty search string', () => {
      const result = BaseFilterUtil.buildSearchFilter('', ['label']);
      expect(result).toEqual([]);
    });

    it('returns empty array for undefined search', () => {
      const result = BaseFilterUtil.buildSearchFilter(undefined as never, [
        'label',
      ]);
      expect(result).toEqual([]);
    });

    it('builds $or match stage for search term', () => {
      const result = BaseFilterUtil.buildSearchFilter('test', [
        'label',
        'description',
      ]);
      expect(result).toHaveLength(1);
      const matchStage = result[0] as { $match: { $or: unknown[] } };
      expect(matchStage.$match.$or).toHaveLength(2);
    });
  });
});
