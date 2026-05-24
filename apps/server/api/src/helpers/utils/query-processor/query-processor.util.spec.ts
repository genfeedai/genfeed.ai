import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { QueryProcessor } from '@api/helpers/utils/query-processor/query-processor.util';

describe('QueryProcessor', () => {
  describe('processPaginationQuery', () => {
    it('should return default values for empty query', () => {
      const result = QueryProcessor.processPaginationQuery({});

      expect(result).toEqual({
        limit: 10,
        page: 1,
        pagination: true,
        skip: 0,
        sort: { createdAt: -1 },
      });
    });

    it('should process valid pagination parameters', () => {
      const result = QueryProcessor.processPaginationQuery({
        limit: 20,
        page: 2,
        sort: 'name:1',
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(20);
      expect(result.pagination).toBe(true);
    });

    it('should throw validation error for invalid page', () => {
      expect(() => {
        QueryProcessor.processPaginationQuery({ page: -1 });
      }).toThrow(ValidationException);
    });

    it('should throw validation error for page too large', () => {
      expect(() => {
        QueryProcessor.processPaginationQuery({ page: 10001 });
      }).toThrow(ValidationException);
    });

    it('should throw validation error for invalid limit', () => {
      expect(() => {
        QueryProcessor.processPaginationQuery({ limit: -1 });
      }).toThrow(ValidationException);
    });

    it('should respect custom options', () => {
      const result = QueryProcessor.processPaginationQuery(
        { limit: 200, page: 1 },
        { defaultLimit: 50, defaultSort: { updatedAt: -1 }, maxLimit: 200 },
      );

      expect(result.limit).toBe(200);
      expect(result.sort).toEqual({ updatedAt: -1 });
    });
  });

  describe('processSearchQuery', () => {
    it('should return null for empty search term', () => {
      expect(QueryProcessor.processSearchQuery('')).toBeNull();
      expect(QueryProcessor.processSearchQuery(undefined)).toBeNull();
      expect(QueryProcessor.processSearchQuery('   ')).toBeNull();
    });

    it('should create regex search for multiple fields', () => {
      const result = QueryProcessor.processSearchQuery('test', [
        'name',
        'description',
      ]);

      expect(result).toHaveProperty('OR');
      expect(result?.OR).toHaveLength(2);
      expect(result?.OR?.[0]).toHaveProperty('name');
      expect(result?.OR?.[1]).toHaveProperty('description');
    });

    it('should create simple regex search for single field', () => {
      const result = QueryProcessor.processSearchQuery('test', ['name']);

      expect(result).toHaveProperty('name');
      expect(result).not.toHaveProperty('OR');
    });

    it('should create text search when $text field is specified', () => {
      const result = QueryProcessor.processSearchQuery('test', ['$text']);

      expect(result).toHaveProperty('$text');
      expect(result?.$text).toEqual({
        $caseSensitive: false,
        $search: 'test',
      });
    });
  });

  describe('processDateRangeQuery', () => {
    it('should return null when no dates provided', () => {
      expect(QueryProcessor.processDateRangeQuery()).toBeNull();
    });

    it('should create date range query with start date', () => {
      const startDate = '2023-01-01';
      const result = QueryProcessor.processDateRangeQuery(startDate);

      expect(result).toHaveProperty('createdAt');
      expect(result?.createdAt).toHaveProperty('gte');
      expect(result?.createdAt?.gte).toBeInstanceOf(Date);
    });

    it('should create date range query with end date', () => {
      const endDate = '2023-12-31';
      const result = QueryProcessor.processDateRangeQuery(undefined, endDate);

      expect(result).toHaveProperty('createdAt');
      expect(result?.createdAt).toHaveProperty('lte');
      expect(result?.createdAt?.lte).toBeInstanceOf(Date);
    });

    it('should create date range query with both dates', () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';
      const result = QueryProcessor.processDateRangeQuery(startDate, endDate);

      expect(result).toHaveProperty('createdAt');
      expect(result?.createdAt).toHaveProperty('gte');
      expect(result?.createdAt).toHaveProperty('lte');
    });

    it('should use custom field name', () => {
      const result = QueryProcessor.processDateRangeQuery(
        '2023-01-01',
        undefined,
        'updatedAt',
      );

      expect(result).toHaveProperty('updatedAt');
      expect(result).not.toHaveProperty('createdAt');
    });

    it('should throw validation error for invalid date', () => {
      expect(() => {
        QueryProcessor.processDateRangeQuery('invalid-date');
      }).toThrow(ValidationException);
    });
  });

  describe('combineFilters', () => {
    it('should return empty object for no filters', () => {
      expect(QueryProcessor.combineFilters()).toEqual({});
    });

    it('should return single filter unchanged', () => {
      const filter = { name: 'test' };
      expect(QueryProcessor.combineFilters(filter)).toEqual(filter);
    });

    it('should combine multiple filters with AND', () => {
      const filter1 = { name: 'test' };
      const filter2 = { status: 'active' };
      const result = QueryProcessor.combineFilters(filter1, filter2);

      expect(result).toEqual({
        AND: [filter1, filter2],
      });
    });

    it('should ignore null and empty filters', () => {
      const filter1 = { name: 'test' };
      const result = QueryProcessor.combineFilters(filter1, null, {});

      expect(result).toEqual(filter1);
    });
  });

  describe('createAggregationOptions', () => {
    it('should create basic aggregation options', () => {
      const processedQuery = {
        limit: 10,
        page: 2,
        pagination: true,
        skip: 10,
        sort: { createdAt: -1 },
      };

      const result = QueryProcessor.createAggregationOptions(processedQuery);

      expect(result).toEqual({
        limit: 10,
        page: 2,
        pagination: true,
        sort: { createdAt: -1 },
      });
    });

    it('should include custom labels when provided', () => {
      const processedQuery = {
        limit: 10,
        page: 1,
        pagination: true,
        skip: 0,
        sort: { createdAt: -1 },
      };

      const customLabels = { totalDocs: 'count' };
      const result = QueryProcessor.createAggregationOptions(
        processedQuery,
        customLabels,
      );

      expect(result.customLabels).toBeDefined();
      expect(result.customLabels.totalDocs).toBe('count');
      expect(result.customLabels.docs).toBe('data'); // default value
    });
  });
});
