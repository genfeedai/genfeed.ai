import { handleStableAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { SortObject } from '@genfeedai/contracts/interfaces';

/** Columns the workflows list can be ordered by. */
export const WORKFLOW_SORT_FIELDS: readonly string[] = [
  'createdAt',
  'executionCount',
  'label',
  'lastExecutedAt',
  'status',
  'trigger',
  'updatedAt',
];

/**
 * The `orderBy` for the workflows list: the requested column, then newest
 * first, then id, so rows with equal values keep a stable page order. An
 * unknown or missing sort falls back to newest first.
 */
export function buildWorkflowListOrderBy(sort: string | undefined): SortObject {
  return handleStableAllowedQuerySort(sort, WORKFLOW_SORT_FIELDS, {
    createdAt: -1,
  });
}
