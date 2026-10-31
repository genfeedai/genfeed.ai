import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * The `where` fragment for the superadmin user search: a case-insensitive
 * match on email, either name or the handle. An empty or blank term adds no
 * constraint.
 */
export function buildUserSearchWhere(
  search: string | undefined,
): Prisma.UserWhereInput {
  const term = search?.trim();
  if (!term) {
    return {};
  }

  const contains = { contains: term, mode: 'insensitive' } as const;
  return {
    OR: [
      { email: contains },
      { firstName: contains },
      { lastName: contains },
      { name: contains },
      { handle: contains },
    ],
  };
}

/** Columns the superadmin user list can be ordered by. */
export const USER_SORT_FIELDS: readonly string[] = [
  'createdAt',
  'email',
  'lastActiveAt',
  'name',
];

/** Nullable columns sort their empty values after the filled ones in both directions. */
const NULLABLE_USER_SORT_FIELDS: readonly string[] = [
  'email',
  'lastActiveAt',
  'name',
];

/** The columns a requested sort key orders by: the list shows a name built from `name` or the first and last name. */
const USER_SORT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  name: ['name', 'firstName', 'lastName'],
};

/**
 * The `orderBy` for the superadmin user list: the requested column, then
 * newest first, then id, so rows with equal values keep a stable page order.
 * An unknown or missing sort falls back to newest first.
 */
export function buildUserOrderBy(
  sort: string | undefined,
): Prisma.UserOrderByWithRelationInput[] {
  const requested = handleAllowedQuerySort(sort, USER_SORT_FIELDS, {});

  const requestedOrder = Object.entries(requested).flatMap(
    ([field, direction]) =>
      (USER_SORT_COLUMNS[field] ?? [field]).map((column) => {
        const order = direction === 1 ? 'asc' : 'desc';
        return (
          NULLABLE_USER_SORT_FIELDS.includes(field)
            ? { [column]: { nulls: 'last', sort: order } }
            : { [column]: order }
        ) as Prisma.UserOrderByWithRelationInput;
      }),
  );

  return [
    ...requestedOrder,
    ...(requested.createdAt === undefined
      ? [{ createdAt: 'desc' } as const]
      : []),
    { id: 'desc' },
  ];
}
