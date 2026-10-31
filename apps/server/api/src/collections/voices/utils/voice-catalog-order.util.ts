import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Columns the voice catalog table can be ordered by, named as the table names
 * them. `provider` and `externalVoiceId` are stored as `externalProvider` and
 * `externalId`; `status` orders by whether the voice is active.
 */
export const VOICE_CATALOG_SORT_FIELDS: readonly string[] = [
  'externalVoiceId',
  'language',
  'name',
  'provider',
  'status',
];

type SortOrder = 'asc' | 'desc';

function toVoiceOrderBy(
  field: string,
  order: SortOrder,
): Prisma.ExternalVoiceOrderByWithRelationInput {
  switch (field) {
    case 'externalVoiceId':
      return { externalId: order };
    case 'language':
      return { language: { nulls: 'last', sort: order } };
    case 'provider':
      return { externalProvider: order };
    case 'status':
      return { isActive: order };
    default:
      return { name: order };
  }
}

/**
 * The `orderBy` for the voice catalog: the requested column, then name and id,
 * so voices that tie keep one order across pages. An unknown or missing sort
 * is by name.
 */
export function buildVoiceCatalogOrderBy(
  sort: string | undefined,
): Prisma.ExternalVoiceOrderByWithRelationInput[] {
  const requested = handleAllowedQuerySort(sort, VOICE_CATALOG_SORT_FIELDS, {});

  return [
    ...Object.entries(requested).map(([field, direction]) =>
      toVoiceOrderBy(field, direction === 1 ? 'asc' : 'desc'),
    ),
    ...(requested.name === undefined ? [{ name: 'asc' } as const] : []),
    { id: 'asc' },
  ];
}
