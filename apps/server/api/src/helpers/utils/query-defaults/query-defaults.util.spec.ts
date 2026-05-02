import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';

describe('QueryDefaultsUtil', () => {
  describe('getPaginationDefaults', () => {
    it('should return default pagination values when no query is provided', () => {
      const result = QueryDefaultsUtil.getPaginationDefaults();
      expect(result).toEqual({
        limit: 10,
        page: 1,
        pagination: true,
      });
    });

    it('should use provided values when pagination is enabled', () => {
      const query = { limit: 50, page: 2, pagination: true };
      const result = QueryDefaultsUtil.getPaginationDefaults(query);
      expect(result).toEqual({
        limit: 50,
        page: 2,
        pagination: true,
      });
    });

    it('should pass through limit and page when pagination is disabled', () => {
      const query = { limit: 5, page: 3, pagination: false };
      const result = QueryDefaultsUtil.getPaginationDefaults(query);
      expect(result).toEqual({
        limit: 5,
        page: 3,
        pagination: false,
      });
    });

    it('should convert string pagination to boolean', () => {
      const query = { pagination: 'false' };
      const result = QueryDefaultsUtil.getPaginationDefaults(query);
      expect(result.pagination).toBe(false);
    });

    it('should handle string "true" for pagination', () => {
      const query = { pagination: 'true' };
      const result = QueryDefaultsUtil.getPaginationDefaults(query);
      expect(result.pagination).toBe(true);
    });
  });

  describe('getIsDeletedDefault', () => {
    it('should return default false when no value is provided', () => {
      const result = QueryDefaultsUtil.getIsDeletedDefault();
      expect(result).toBe(false);
    });

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
    it('should apply all defaults to an empty query object', () => {
      const result = QueryDefaultsUtil.applyDefaults({});
      expect(result).toEqual({
        isDeleted: false,
        limit: 10,
        page: 1,
        pagination: true,
        sort: 'createdAt: -1',
      });
    });

    it('should preserve provided values', () => {
      const query = {
        isDeleted: true,
        limit: 100,
        page: 3,
        pagination: true,
        sort: 'name',
      };
      const result = QueryDefaultsUtil.applyDefaults(query);
      expect(result).toEqual(query);
    });

    it('should preserve provided limit and page when pagination is disabled', () => {
      const query = {
        isDeleted: true,
        limit: 25,
        page: 3,
        pagination: false,
        sort: 'name',
      };
      const result = QueryDefaultsUtil.applyDefaults(query);
      expect(result).toEqual({
        isDeleted: true,
        limit: 25,
        page: 3,
        pagination: false,
        sort: 'name',
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
  });

  describe('parseStatusFilter', () => {
    describe('default behavior', () => {
      it('should return draft/uploaded/completed when status is undefined', () => {
        const result = QueryDefaultsUtil.parseStatusFilter();
        expect(result).toEqual({ in: ['draft', 'uploaded', 'completed'] });
      });

      it('should return draft/uploaded/completed when status is empty string', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('');
        expect(result).toEqual({ in: ['draft', 'uploaded', 'completed'] });
      });

      it('should return draft/uploaded/completed when status is only whitespace', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('   ');
        expect(result).toEqual({ in: ['draft', 'uploaded', 'completed'] });
      });

      it('should keep comma-only string values as-is', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(',,,');
        expect(result).toEqual(',,,');
      });

      it('should keep comma-whitespace values as-is after trim', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('  ,  ,  ');
        expect(result).toEqual(',  ,');
      });
    });

    describe('single status values', () => {
      it('should return single status value as-is', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('completed');
        expect(result).toBe('completed');
      });

      it('should trim whitespace from single value', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('  processing  ');
        expect(result).toBe('processing');
      });

      it('should keep single value with trailing comma', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('processing,');
        expect(result).toEqual('processing,');
      });
    });

    describe('comma-containing string values', () => {
      it('should keep comma-separated values as a single string', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(
          'processing,completed',
        );
        expect(result).toEqual('processing,completed');
      });

      it('should keep completed and failed filter literal', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('completed,failed');
        expect(result).toEqual('completed,failed');
      });

      it('should keep comma-separated values with inner whitespace', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(
          'processing , completed , failed',
        );
        expect(result).toEqual('processing , completed , failed');
      });

      it('should keep complex comma-separated status strings', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(
          'queued,processing,transcoding,completed',
        );
        expect(result).toEqual('queued,processing,transcoding,completed');
      });
    });

    describe('stray commas and whitespace', () => {
      it('should keep values with empty comma segments', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(
          'processing,,completed,',
        );
        expect(result).toEqual('processing,,completed,');
      });

      it('should keep stray commas with whitespace', () => {
        const result =
          QueryDefaultsUtil.parseStatusFilter('completed, ,failed');
        expect(result).toEqual('completed, ,failed');
      });

      it('should keep leading comma', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(
          ',processing,completed',
        );
        expect(result).toEqual(',processing,completed');
      });

      it('should keep multiple consecutive commas', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('draft,,,uploaded');
        expect(result).toEqual('draft,,,uploaded');
      });
    });

    describe('edge cases and invalid values', () => {
      it('should handle single comma', () => {
        const result = QueryDefaultsUtil.parseStatusFilter(',');
        expect(result).toEqual(',');
      });

      it('should preserve invalid/unknown status values', () => {
        const result = QueryDefaultsUtil.parseStatusFilter('invalid_status');
        expect(result).toBe('invalid_status');
      });

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
      it('should return { not: "failed" } when status is undefined', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter();
        expect(result).toEqual({ not: 'failed' });
      });

      it('should return { not: "failed" } when status is empty string', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter('');
        expect(result).toEqual({ not: 'failed' });
      });

      it('should return { not: "failed" } when status is only whitespace', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter('   ');
        expect(result).toEqual({ not: 'failed' });
      });

      it('should keep comma-only string values as-is', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter(',,,');
        expect(result).toEqual(',,,');
      });
    });

    describe('single status values', () => {
      it('should return single status value as-is', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter('completed');
        expect(result).toBe('completed');
      });

      it('should trim whitespace from single value', () => {
        const result =
          QueryDefaultsUtil.parseMusicStatusFilter('  processing  ');
        expect(result).toBe('processing');
      });
    });

    describe('comma-containing string values (Studio filter scenario)', () => {
      it('should keep comma-separated values as a single string', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter(
          'processing,uploaded,completed,validated',
        );
        expect(result).toEqual('processing,uploaded,completed,validated');
      });

      it('should keep processing,completed filter literal', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter(
          'processing,completed',
        );
        expect(result).toEqual('processing,completed');
      });

      it('should keep comma-separated values with inner whitespace', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter(
          'processing , uploaded , completed',
        );
        expect(result).toEqual('processing , uploaded , completed');
      });
    });

    describe('stray commas and whitespace', () => {
      it('should keep values with empty comma segments', () => {
        const result = QueryDefaultsUtil.parseMusicStatusFilter(
          'processing,,completed,',
        );
        expect(result).toEqual('processing,,completed,');
      });
    });
  });

  describe('parseBooleanFilter', () => {
    describe('undefined values', () => {
      it('should return default value when value is undefined', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(undefined, {
          not: null,
        });
        expect(result).toEqual({ not: null });
      });

      it('should return default { not: null } when value is undefined and no default provided', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(undefined);
        expect(result).toEqual({ not: null });
      });

      it('should support custom default values', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(undefined, true);
        expect(result).toBe(true);
      });
    });

    describe('string values', () => {
      it('should return true for string "true"', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter('true');
        expect(result).toBe(true);
      });

      it('should return false for string "false" (avoiding Boolean pitfall)', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter('false');
        expect(result).toBe(false);
      });

      it('should return false for string "0"', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter('0');
        expect(result).toBe(false);
      });

      it('should return false for empty string', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter('');
        expect(result).toBe(false);
      });

      it('should return true for non-empty truthy strings', () => {
        expect(QueryDefaultsUtil.parseBooleanFilter('yes')).toBe(true);
        expect(QueryDefaultsUtil.parseBooleanFilter('1')).toBe(true);
        expect(QueryDefaultsUtil.parseBooleanFilter('anything')).toBe(true);
      });
    });

    describe('boolean values', () => {
      it('should return true for boolean true', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(true);
        expect(result).toBe(true);
      });

      it('should return false for boolean false', () => {
        const result = QueryDefaultsUtil.parseBooleanFilter(false);
        expect(result).toBe(false);
      });
    });
  });
});
