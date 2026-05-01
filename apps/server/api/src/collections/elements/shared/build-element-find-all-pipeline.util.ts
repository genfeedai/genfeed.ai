import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';

interface ElementMetadata {
  organization?: string;
  user?: string;
}

interface BuildElementFindAllQueryOptions {
  adminFilter?: Record<string, unknown> | null;
  defaultSort?: Record<string, 1 | -1>;
  includeStateFilters?: boolean;
  metadata: ElementMetadata;
  query: BaseQueryDto;
  searchableFields?: string[];
}

export function buildElementFindAllQuery({
  adminFilter,
  defaultSort = { createdAt: -1, label: 1 },
  includeStateFilters = false,
  metadata,
  query,
  searchableFields = [],
}: BuildElementFindAllQueryOptions): Record<string, unknown> {
  const queryAny = query as unknown as Record<string, unknown>;
  const orConditions: Record<string, unknown>[] = [
    { organization: null, user: null },
  ];

  if (metadata.organization) {
    orConditions.push({
      organization: metadata.organization,
    });
  }

  if (metadata.user) {
    orConditions.push({ user: metadata.user });
  }

  const where: Record<string, unknown> = {
    isDeleted: query.isDeleted ?? false,
    ...(includeStateFilters &&
      typeof queryAny.isActive === 'boolean' && {
        isActive: queryAny.isActive,
      }),
    ...(includeStateFilters &&
      typeof queryAny.isDefault === 'boolean' && {
        isDefault: queryAny.isDefault,
      }),
    ...(adminFilter ?? { OR: orConditions }),
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
