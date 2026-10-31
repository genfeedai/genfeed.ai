import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Columns the organization memory table can be ordered by. `promotedSkillId`
 * is the Status column (promoted memories first or last) and `user` is the
 * author.
 */
export const MEMORY_SORT_FIELDS: readonly string[] = [
  'createdAt',
  'promotedSkillId',
  'scope',
  'summary',
  'user',
];

type SortOrder = 'asc' | 'desc';

function toMemoryOrderBy(
  field: string,
  order: SortOrder,
): Prisma.AgentMemoryOrderByWithRelationInput {
  switch (field) {
    case 'user':
      return { user: { name: { nulls: 'last', sort: order } } };
    case 'promotedSkillId':
      return { promotedSkillId: { nulls: 'last', sort: order } };
    case 'summary':
      return { summary: { nulls: 'last', sort: order } };
    case 'scope':
      return { scope: order };
    default:
      return { createdAt: order };
  }
}

/**
 * The `orderBy` for the organization memory list: the requested column, then
 * newest first and id, so rows that tie keep one order across pages. An unknown
 * or missing sort is newest first.
 */
export function buildMemoryListOrderBy(
  sort: string | undefined,
): Prisma.AgentMemoryOrderByWithRelationInput[] {
  const requested = handleAllowedQuerySort(sort, MEMORY_SORT_FIELDS, {});

  return [
    ...Object.entries(requested).map(([field, direction]) =>
      toMemoryOrderBy(field, direction === 1 ? 'asc' : 'desc'),
    ),
    ...(requested.createdAt === undefined
      ? [{ createdAt: 'desc' } as const]
      : []),
    { id: 'desc' },
  ];
}
