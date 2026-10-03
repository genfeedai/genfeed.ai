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

export function buildElementFindAllQuery({
  adminFilter,
  defaultSort = { sortOrder: 1, label: 1, createdAt: -1 },
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
