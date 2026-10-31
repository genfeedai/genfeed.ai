import { handleStableAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { SortObject } from '@genfeedai/contracts/interfaces';

/** Columns the brands list can be ordered by. */
export const BRAND_SORT_FIELDS: readonly string[] = [
  'createdAt',
  'label',
  'slug',
];

/**
 * The `orderBy` for the brands list: the requested column, then newest first
 * and id, so rows that tie keep one order across pages. An unknown column is
 * newest first.
 */
export function buildBrandListOrderBy(sort: string | undefined): SortObject {
  return handleStableAllowedQuerySort(sort, BRAND_SORT_FIELDS, {
    createdAt: -1,
  });
}
