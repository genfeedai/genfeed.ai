import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Columns the members list can be ordered by. Brands is assembled from
 * per-member brand access, which the list cannot order by.
 */
export const MEMBER_SORT_FIELDS: readonly string[] = [
  'createdAt',
  'isActive',
  'roleLabel',
  'userFullName',
];

type SortOrder = 'asc' | 'desc';

function toMemberOrderBy(
  field: string,
  order: SortOrder,
): Prisma.MemberOrderByWithRelationInput[] {
  switch (field) {
    case 'userFullName':
      return [
        { user: { firstName: { nulls: 'last', sort: order } } },
        { user: { lastName: { nulls: 'last', sort: order } } },
      ];
    case 'roleLabel':
      return [{ role: { label: order } }];
    case 'isActive':
      return [{ isActive: order }];
    default:
      return [{ createdAt: order }];
  }
}

/**
 * The `orderBy` for the members list: the requested column, then newest first,
 * then id, so rows with equal values keep a stable page order. An unknown or
 * missing sort falls back to newest first.
 */
export function buildMemberOrderBy(
  sort: string | undefined,
): Prisma.MemberOrderByWithRelationInput[] {
  const requested = handleAllowedQuerySort(sort, MEMBER_SORT_FIELDS, {});

  return [
    ...Object.entries(requested).flatMap(([field, direction]) =>
      toMemberOrderBy(field, direction === 1 ? 'asc' : 'desc'),
    ),
    ...(requested.createdAt === undefined
      ? [{ createdAt: 'desc' } as const]
      : []),
    { id: 'desc' },
  ];
}
