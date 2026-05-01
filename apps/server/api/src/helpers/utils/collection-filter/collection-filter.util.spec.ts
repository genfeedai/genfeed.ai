import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { AssetScope } from '@genfeedai/enums';

describe('CollectionFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('buildBrandFilter', () => {
    it('returns provided brand ObjectId when valid', () => {
      const brandId = '507f191e810c19729de860ee';
      const result = CollectionFilterUtil.buildBrandFilter(brandId);

      expect(result).toEqual(expect.any(String));
      expect(result as string).toBe(brandId);
    });

    it('falls back to user brand metadata by default', () => {
      const userBrand = '507f191e810c19729de860ee';
      const result = CollectionFilterUtil.buildBrandFilter(undefined, {
        brand: userBrand,
      });
      expect(result).toEqual(expect.any(String));
      expect(result as string).toBe(userBrand);
    });

    it('returns existence filter when metadata missing', () => {
      const result = CollectionFilterUtil.buildBrandFilter(
        undefined,
        undefined,
      );
      expect(result).toEqual({ not: true });
    });

    it('supports defaultTo exists and none modes', () => {
      expect(
        CollectionFilterUtil.buildBrandFilter(undefined, undefined, 'exists'),
      ).toEqual({ not: true });

      expect(
        CollectionFilterUtil.buildBrandFilter(undefined, undefined, 'none'),
      ).toEqual({ not: null });
    });
  });

  describe('buildScopeFilter', () => {
    it('returns provided scope value', () => {
      const result = CollectionFilterUtil.buildScopeFilter(AssetScope.PUBLIC);
      expect(result).toBe(AssetScope.PUBLIC);
    });

    it('returns not-null filter when scope missing', () => {
      const result = CollectionFilterUtil.buildScopeFilter(undefined);
      expect(result).toEqual({ not: null });
    });
  });

  describe('buildSearchFilter', () => {
    it('returns empty array when no search term', () => {
      const result = CollectionFilterUtil.buildSearchFilter(undefined, [
        'metadata.label',
      ]);
      expect(result).toEqual([]);
    });

    it('creates pipeline stages for provided fields', () => {
      const stages = CollectionFilterUtil.buildSearchFilter('hello', [
        'metadata.label',
        'metadata.description',
      ]);

      expect(stages).toHaveLength(1);
      const matchStage = stages[0] as Record<string, unknown> & {
        match: Record<string, unknown>;
      };
      expect(matchStage.match?.OR).toHaveLength(2);
      expect(matchStage.match?.OR?.[0]).toEqual({
        'metadata.label': { mode: 'insensitive', contains: 'hello' },
      });
    });
  });

  describe('buildOwnershipFilter', () => {
    const userId = '507f191e810c19729de860ee';
    const organizationId = '507f191e810c19729de860ee';

    it('builds OR filter when user and organization exist', () => {
      const result = CollectionFilterUtil.buildOwnershipFilter({
        organization: organizationId,
        user: userId,
      });

      expect(result).toHaveProperty('OR');
      expect(result.OR).toHaveLength(2);
      expect(result.OR?.[0].user).toBe(userId);
      expect(result.OR?.[1].organization).toBe(organizationId);
    });

    it('returns single condition when only user provided', () => {
      const result = CollectionFilterUtil.buildOwnershipFilter(
        { user: userId },
        { includeOrganization: false },
      );
      expect(result).toHaveProperty('user');
      expect((result as Record<string, string>).user).toBe(userId);
    });

    it('returns empty filter when metadata empty', () => {
      const result = CollectionFilterUtil.buildOwnershipFilter({});
      expect(result).toEqual({});
    });
  });

  describe('buildDateRangeFilter', () => {
    it('returns empty object when no dates provided', () => {
      expect(CollectionFilterUtil.buildDateRangeFilter()).toEqual({});
    });

    it('creates gte/lte when dates provided', () => {
      const result = CollectionFilterUtil.buildDateRangeFilter(
        '2024-01-01',
        '2024-12-31',
        'evaluatedAt',
      );
      expect(result).toHaveProperty('evaluatedAt');
      expect(result.evaluatedAt).toMatchObject({
        gte: new Date('2024-01-01'),
        lte: new Date('2024-12-31'),
      });
    });

    it('supports single-ended ranges', () => {
      const onlyStart = CollectionFilterUtil.buildDateRangeFilter('2024-01-01');
      expect(onlyStart.createdAt.gte).toEqual(new Date('2024-01-01'));

      const onlyEnd = CollectionFilterUtil.buildDateRangeFilter(
        undefined,
        '2024-12-31',
      );
      expect(onlyEnd.createdAt.lte).toEqual(new Date('2024-12-31'));
    });
  });

  describe('buildArrayFilter', () => {
    it('returns empty when values undefined', () => {
      expect(CollectionFilterUtil.buildArrayFilter(undefined)).toEqual({});
    });

    it('wraps single string in array', () => {
      const result = CollectionFilterUtil.buildArrayFilter('tech', 'tags');
      expect(result).toEqual({ tags: { in: ['tech'] } });
    });

    it('uses $all when matchAll is true', () => {
      const result = CollectionFilterUtil.buildArrayFilter(
        ['a', 'b'],
        'tags',
        true,
      );
      expect(result).toEqual({ tags: { $all: ['a', 'b'] } });
    });
  });

  describe('buildStatusFilter', () => {
    it('returns empty when status undefined', () => {
      expect(CollectionFilterUtil.buildStatusFilter()).toEqual({});
    });

    it('handles array of statuses', () => {
      expect(
        CollectionFilterUtil.buildStatusFilter(['completed', 'failed']),
      ).toEqual({ status: { in: ['completed', 'failed'] } });
    });

    it('treats comma separated string as a single literal value', () => {
      expect(
        CollectionFilterUtil.buildStatusFilter('completed,processing'),
      ).toEqual({ status: 'completed,processing' });
    });

    it('returns trimmed status for single value', () => {
      expect(CollectionFilterUtil.buildStatusFilter(' draft ')).toEqual({
        status: 'draft',
      });
    });
  });

  describe('buildCategoryFilter', () => {
    it('returns empty when category undefined', () => {
      expect(CollectionFilterUtil.buildCategoryFilter()).toEqual({});
    });

    it('wraps arrays with in operator', () => {
      expect(
        CollectionFilterUtil.buildCategoryFilter(['video', 'image']),
      ).toEqual({ category: { in: ['video', 'image'] } });
    });

    it('returns direct category for single value', () => {
      expect(CollectionFilterUtil.buildCategoryFilter('video')).toEqual({
        category: 'video',
      });
    });
  });

  describe('conditionalStages', () => {
    const stages: Record<string, unknown>[] = [{ take: 5 }];

    it('returns stages when condition true', () => {
      expect(CollectionFilterUtil.conditionalStages(true, stages)).toEqual(
        stages,
      );
    });

    it('returns empty array when condition false', () => {
      expect(CollectionFilterUtil.conditionalStages(false, stages)).toEqual([]);
    });
  });

  describe('buildBooleanFilter', () => {
    it('returns default when value undefined', () => {
      expect(CollectionFilterUtil.buildBooleanFilter(undefined)).toEqual({
        not: null,
      });
    });

    it('parses string booleans correctly', () => {
      expect(CollectionFilterUtil.buildBooleanFilter('false')).toBe(false);
      expect(CollectionFilterUtil.buildBooleanFilter('true')).toBe(true);
      expect(CollectionFilterUtil.buildBooleanFilter('0')).toBe(false);
    });

    it('returns boolean for real boolean inputs', () => {
      expect(CollectionFilterUtil.buildBooleanFilter(true)).toBe(true);
      expect(CollectionFilterUtil.buildBooleanFilter(false)).toBe(false);
    });
  });

  describe('buildSortObject', () => {
    it('returns default sort when sort string missing', () => {
      expect(CollectionFilterUtil.buildSortObject()).toEqual({
        createdAt: -1,
      });
    });

    it('parses ascending and descending indicators', () => {
      const sort = CollectionFilterUtil.buildSortObject('label,-createdAt');
      expect(sort).toEqual({ createdAt: -1, label: 1 });
    });
  });

  describe('buildPaginationOptions', () => {
    it('converts string pagination flag to boolean', () => {
      const result = CollectionFilterUtil.buildPaginationOptions({
        limit: 25,
        pagination: 'false',
      });
      expect(result).toMatchObject({
        limit: 25,
        page: 1,
        pagination: false,
      });
    });

    it('merges custom labels', () => {
      const result = CollectionFilterUtil.buildPaginationOptions(
        { limit: 10, page: 3, pagination: true },
        { totalDocs: 'items' },
      );
      expect(result.customLabels).toEqual({ totalDocs: 'items' });
      expect(result.page).toBe(3);
    });
  });
});
