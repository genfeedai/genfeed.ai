import { buildElementScopeConditions } from '@api/collections/elements/shared/element-scope.util';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';

interface ElementMetadata {
  isSuperAdmin?: boolean;
  organizationId?: string;
}

interface BuildElementFindAllQueryOptions {
  adminFilter?: Record<string, unknown> | null;
  defaultSort?: Record<string, 1 | -1>;
  filters?: Record<string, unknown>;
  includeStateFilters?: boolean;
  metadata: ElementMetadata;
  query: BaseQueryDto;
  searchableFields?: string[];
}

/**
 * Platform defaults first, then the organization's own rows, so a page of
 * defaults is never pushed out by organization rows (matches `/elements`).
 * `organizationId` descending relies on PostgreSQL ordering NULLs first for
 * DESC; the entries keep their order through `BaseService.normalizeSort`.
 */
export const DEFAULT_ELEMENT_SORT: Record<string, 1 | -1> = {
  organizationId: -1,
  sortOrder: 1,
  createdAt: -1,
  label: 1,
};

export function buildElementFindAllQuery({
  adminFilter,
  defaultSort = DEFAULT_ELEMENT_SORT,
  filters,
  includeStateFilters = false,
  metadata,
  query,
  searchableFields = [],
}: BuildElementFindAllQueryOptions): Record<string, unknown> {
  const queryAny = query as unknown as Record<string, unknown>;
  const where: Record<string, unknown> = {
    isDeleted: query.isDeleted ?? false,
    ...(filters ?? {}),
    ...(includeStateFilters &&
      typeof queryAny.isActive === 'boolean' && {
        isActive: queryAny.isActive,
      }),
    ...(includeStateFilters &&
      typeof queryAny.isDefault === 'boolean' && {
        isDefault: queryAny.isDefault,
      }),
    ...(adminFilter ?? { OR: buildElementScopeConditions(metadata) }),
  };

  if (searchableFields.length > 0 && typeof queryAny.search === 'string') {
    const search = queryAny.search;
    where.AND = [
      {
        OR: searchableFields.map((field) => ({
          [field]: { contains: search, mode: 'insensitive' },
        })),
      },
    ];
  }

  return {
    orderBy: query.sort ? handleQuerySort(query.sort) : defaultSort,
    where,
  };
}
