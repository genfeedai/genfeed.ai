import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';

describe('QueryDefaultsUtil', () => {
  describe('getIsDeletedDefault', () => {
    it('should return provided boolean value', () => {
      expect(QueryDefaultsUtil.getIsDeletedDefault(true)).toBe(true);
      expect(QueryDefaultsUtil.getIsDeletedDefault(false)).toBe(false);
    });
  });

  describe('getSortDefault', () => {
    it('should return default sort value when no value is provided', () => {
      const result = QueryDefaultsUtil.getSortDefault();
      expect(result).toBe('createdAt: -1');
    });

    it('should return provided sort value', () => {
      const result = QueryDefaultsUtil.getSortDefault('name');
      expect(result).toBe('name');
    });
  });

  describe('applyDefaults', () => {
    it('should preserve provided page, limit, sort, and isDeleted values', () => {
      const query = {
        isDeleted: true,
        limit: 100,
        page: 3,
        sort: 'name',
      };
      const result = QueryDefaultsUtil.applyDefaults(query);
      expect(result).toEqual({
        ...query,
        pagination: true,
      });
    });

    it('should mix defaults with provided values', () => {
      const query = { page: 5, sort: 'updatedAt' };
      const result = QueryDefaultsUtil.applyDefaults(query);
      expect(result).toEqual({
        isDeleted: false,
        limit: 10,
        page: 5,
        pagination: true,
        sort: 'updatedAt',
      });
    });

    it('should coerce runtime string pagination values', () => {
      const result = QueryDefaultsUtil.applyDefaults({
        limit: '25' as never,
        page: '4' as never,
      });

      expect(result.limit).toBe(25);
      expect(result.page).toBe(4);
    });
  });

  describe('parseStatusFilter', () => {
    describe('default behavior', () => {
      it('should return draft/uploaded/completed when status is only whitespace', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('   ');
        expect(result).toEqual({ in: ['draft', 'uploaded', 'completed'] });
      });
    });

    describe('edge cases and invalid values', () => {
      it('should preserve invalid comma-separated values as a string', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(
          'completed,invalid,failed',
        );
        expect(result).toEqual('completed,invalid,failed');
      });
    });
  });

  describe('parseMusicStatusFilter', () => {
    describe('default behavior', () => {
      it('should return { not: "failed" } when status is only whitespace', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter('   ');
        expect(result).toEqual({ not: 'failed' });
      });
    });
  });

  describe('parseBooleanFilter', () => {
    describe('undefined values', () => {
      it('should support custom default values', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(undefined, true);
        expect(result).toBe(true);
      });
    });

    describe('string values', () => {
      it('should return false for string "false" (avoiding Boolean pitfall)', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter('false');
        expect(result).toBe(false);
      });

      it('should return true for non-empty truthy strings', () => {
        expect(QueryDefaultsUtil.parseBooleanFilter('yes')).toBe(true);
        expect(QueryDefaultsUtil.parseBooleanFilter('1')).toBe(true);
        expect(QueryDefaultsUtil.parseBooleanFilter('anything')).toBe(true);
      });
    });

    describe('boolean values', () => {
      it('should return false for boolean false', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(false);
        expect(result).toBe(false);
      });
    });
  });
});
