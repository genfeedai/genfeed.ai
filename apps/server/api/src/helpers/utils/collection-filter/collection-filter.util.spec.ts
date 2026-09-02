import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { AssetScope } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

describe('CollectionFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('resolveAuthorizedTenantQuery', () => {
    const orgA = '550e8400-e29b-41d4-a716-446655440001';
    const orgB = '550e8400-e29b-41d4-a716-446655440002';
    const brandA = '550e8400-e29b-41d4-a716-446655440003';

    it('allows superadmin arbitrary organization and brand filters', () => {
      expect(
        CollectionFilterUtil.resolveAuthorizedTenantQuery(
          { brandId: brandA, organizationId: orgB },
          { brandId: brandA, isSuperAdmin: true, organizationId: orgA },
        ),
      ).toEqual({ brandId: brandA, organizationId: orgB });
    });

    it('rejects a member organization filter outside the session org', () => {
      const call = () =>
        CollectionFilterUtil.resolveAuthorizedTenantQuery(
          { organizationId: orgB },
          { brandId: brandA, isSuperAdmin: false, organizationId: orgA },
        );

      expect(call).toThrow(ForbiddenException);

      try {
        call();
        expect.unreachable('expected a ForbiddenException');
      } catch (error) {
        expect((error as ForbiddenException).getResponse()).toEqual({
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        });
      }
    });

    it('allows member brand filters but forces the session organization boundary', () => {
      expect(
        CollectionFilterUtil.resolveAuthorizedTenantQuery(
          { brandId: '550e8400-e29b-41d4-a716-446655440004' },
          { brandId: brandA, isSuperAdmin: false, organizationId: orgA },
        ),
      ).toEqual({
        brandId: '550e8400-e29b-41d4-a716-446655440004',
        organizationId: orgA,
      });
    });

    it('allows member organization filter equal to the session org', () => {
      expect(
        CollectionFilterUtil.resolveAuthorizedTenantQuery(
          { organizationId: orgA },
          { brandId: brandA, isSuperAdmin: false, organizationId: orgA },
        ),
      ).toEqual({ organizationId: orgA });
    });
  });

  describe('applyAuthorizedTenantMatch', () => {
    const orgA = '550e8400-e29b-41d4-a716-446655440001';
    const orgB = '550e8400-e29b-41d4-a716-446655440002';
    const brandA = '550e8400-e29b-41d4-a716-446655440003';

    it('binds members to the session organization even when query asks for another', () => {
      expect(() =>
        CollectionFilterUtil.applyAuthorizedTenantMatch(
          {},
          { organizationId: orgB },
          { brandId: brandA, isSuperAdmin: false, organizationId: orgA },
        ),
      ).toThrow(ForbiddenException);
    });

    it('writes session organization and brand onto the match for members', () => {
      const match: Record<string, unknown> = { isDeleted: false };

      CollectionFilterUtil.applyAuthorizedTenantMatch(
        match,
        {},
        { brandId: brandA, isSuperAdmin: false, organizationId: orgA },
      );

      expect(match).toEqual({
        brandId: brandA,
        isDeleted: false,
        organizationId: orgA,
      });
    });

    it('lets superadmins filter a different organization', () => {
      const match: Record<string, unknown> = { isDeleted: false };

      CollectionFilterUtil.applyAuthorizedTenantMatch(
        match,
        { organizationId: orgB },
        { brandId: brandA, isSuperAdmin: true, organizationId: orgA },
      );

      expect(match.organizationId).toBe(orgB);
    });
  });

  describe('buildBrandFilter', () => {
    it('returns a provided canonical brand ID when valid', () => {
      const brandId = '550e8400-e29b-41d4-a716-446655440003';
      const result = CollectionFilterUtil.buildBrandFilter(brandId);

      expect(result).toEqual(expect.any(String));
      expect(result as string).toBe(brandId);
    });

    it('falls back to user brand metadata by default', () => {
      const userBrand = '550e8400-e29b-41d4-a716-446655440003';
      const result = CollectionFilterUtil.buildBrandFilter(undefined, {
        brandId: userBrand,
      });
      expect(result).toEqual(expect.any(String));
      expect(result as string).toBe(userBrand);
    });

    it('returns existence filter when metadata missing', () => {
      const result = CollectionFilterUtil.buildBrandFilter(
        undefined,
        undefined,
      );
      expect(result).toEqual({ not: null });
    });

    it('supports defaultTo exists and none modes', () => {
      expect(
        CollectionFilterUtil.buildBrandFilter(undefined, undefined, 'exists'),
      ).toEqual({ not: null });

      expect(
        CollectionFilterUtil.buildBrandFilter(undefined, undefined, 'none'),
      ).toEqual({ not: null });
    });
  });

  describe('buildAuthorizedBrandFilter', () => {
    const activeBrandId = '550e8400-e29b-41d4-a716-446655440003';
    const foreignBrandId = '550e8400-e29b-41d4-a716-446655440004';

    it('allows a member to query the active authenticated brand', () => {
      expect(
        CollectionFilterUtil.buildAuthorizedBrandFilter(
          activeBrandId,
          { brandId: activeBrandId },
          false,
        ),
      ).toBe(activeBrandId);
    });

    it('rejects a member query override to another brand', () => {
      expect(() =>
        CollectionFilterUtil.buildAuthorizedBrandFilter(
          foreignBrandId,
          { brandId: activeBrandId },
          false,
        ),
      ).toThrow(ForbiddenException);
    });

    it('allows a superadmin to query another brand', () => {
      expect(
        CollectionFilterUtil.buildAuthorizedBrandFilter(
          foreignBrandId,
          { brandId: activeBrandId },
          true,
        ),
      ).toBe(foreignBrandId);
    });
  });

  describe('buildScopeFilter', () => {
    it('returns provided scope value', () => {
      const result = CollectionFilterUtil.buildScopeFilter(AssetScope.PUBLIC);
      expect(result).toBe(AssetScope.PUBLIC);
    });

    it('omits the scope filter when scope missing', () => {
      const result = CollectionFilterUtil.buildScopeFilter(undefined);
      expect(result).toBeUndefined();
    });

    it('omits malformed scope filter objects', () => {
      const result = CollectionFilterUtil.buildScopeFilter({ not: null });
      expect(result).toBeUndefined();
    });

    it('omits unknown scope strings', () => {
      const result = CollectionFilterUtil.buildScopeFilter('unknown');
      expect(result).toBeUndefined();
    });
  });

  describe('buildSearchFilter', () => {
    it('returns empty where filter when no search term', () => {
      const result = CollectionFilterUtil.buildSearchFilter(undefined, [
        'metadata.label',
      ]);
      expect(result).toEqual({ where: {} });
    });

    it('creates OR where filter for provided fields', () => {
      const result = CollectionFilterUtil.buildSearchFilter('hello', [
        'metadata.label',
        'metadata.description',
      ]);

      const where = result.where as { OR: unknown[] };
      expect(where.OR).toHaveLength(2);
      expect(where.OR[0]).toEqual({
        'metadata.label': { mode: 'insensitive', contains: 'hello' },
      });
    });
  });

  describe('buildOwnershipFilter', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440001';
    const organizationId = '550e8400-e29b-41d4-a716-446655440002';

    it('builds OR filter when user and organization exist', () => {
      const result = CollectionFilterUtil.buildOwnershipFilter({
        organizationId,
        userId,
      });

      expect(result).toHaveProperty('OR');
      expect(result.OR).toHaveLength(2);
      expect(result.OR?.[0].userId).toBe(userId);
      expect(result.OR?.[1].organizationId).toBe(organizationId);
    });

    it('returns single condition when only user provided', () => {
      const result = CollectionFilterUtil.buildOwnershipFilter(
        { userId },
        { includeOrganization: false },
      );
      expect(result).toHaveProperty('userId');
      expect((result as Record<string, string>).userId).toBe(userId);
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
      expect(result).toEqual({ tags: { hasEvery: ['a', 'b'] } });
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
