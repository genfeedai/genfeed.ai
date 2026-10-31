import { handleStableAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { SortObject } from '@genfeedai/contracts/interfaces';

/**
 * Columns the trainings table can be ordered by. `status` is the app name for
 * the persisted `stage`. Trigger word, steps and active live in the JSON
 * config, and source and image totals are counted per row, so the database
 * cannot order by them.
 */
export const TRAINING_SORT_FIELDS: readonly string[] = ['label', 'status'];

/**
 * The `orderBy` for the trainings list: the requested column (stage for
 * `status`), then newest first and id, so rows that tie keep one order across
 * pages. An unknown or missing sort is newest first.
 */
export function buildTrainingOrderBy(sort: string | undefined): SortObject {
  const ordered = handleStableAllowedQuerySort(sort, TRAINING_SORT_FIELDS, {
    createdAt: -1,
  });

  return Object.fromEntries(
    Object.entries(ordered).map(([field, direction]) => [
      field === 'status' ? 'stage' : field,
      direction,
    ]),
  ) as SortObject;
}
