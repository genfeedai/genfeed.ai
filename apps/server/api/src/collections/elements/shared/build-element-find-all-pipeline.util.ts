import { buildElementScopeConditions } from '@api/collections/elements/shared/element-scope.util';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';

interface ElementMetadata {
  isSuperAdmin?: boolean;
  organizationId?: string;
}

interface BuildElementFindAllQueryOptions {
  adminFilter?: Record<string, unknown> | null;
  /** Columns a client may order by; any other requested field is ignored. */
  allowedSortFields?: readonly string[];
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

export const ELEMENT_SORT_FIELDS: readonly string[] = [
  'createdAt',
  'key',
  'label',
];

/**
 * A requested order keeps only allowed fields and ends with `createdAt` and
 * `id`, so rows that tie on the sorted column (labels repeat across platform
 * and organization rows) keep one stable order and pages never repeat or skip.
 * No allowed field requested returns `fallback`.
 */
function buildRequestedElementOrderBy(
  sort: string,
  allowedSortFields: readonly string[],
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  const requested = handleAllowedQuerySort(sort, allowedSortFields, {});
  if (Object.keys(requested).length === 0) {
    return fallback;
  }
  return {
    ...requested,
    ...(requested.createdAt === undefined ? { createdAt: -1 } : {}),
    id: -1,
  };
}

export function buildElementFindAllQuery({
  adminFilter,
  allowedSortFields = ELEMENT_SORT_FIELDS,
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
    orderBy: query.sort
      ? buildRequestedElementOrderBy(query.sort, allowedSortFields, defaultSort)
      : defaultSort,
    where,
  };
}
