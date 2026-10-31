import { handleStableAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { SortObject } from '@genfeedai/contracts/interfaces';

/**
 * Columns the models table can be ordered by. A ranking is followed by newest
 * first and id so rows that tie keep one order across pages.
 */
export const MODEL_SORT_FIELDS: readonly string[] = [
  'cost',
  'isDefault',
  'label',
  'lifecycle',
  'qualityTier',
  'reviewStatus',
];

/** The `orderBy` for the models list; no usable sort is newest first, then key and label. */
export function buildModelListOrderBy(sort: string | undefined): SortObject {
  return handleStableAllowedQuerySort(sort, MODEL_SORT_FIELDS, {
    createdAt: -1,
    key: 1,
    label: 1,
  });
}
