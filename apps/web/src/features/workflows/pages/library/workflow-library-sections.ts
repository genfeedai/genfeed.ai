import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';

/** View-preference key for the Workflows library (`useCollectionViewPreference`). */
export const WORKFLOW_LIBRARY_SURFACE = 'automation.workflows';

/** Recent shows at most this many compact rows. */
export const WORKFLOW_RECENT_LIMIT = 5;

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

/** The most recently updated workflows of the loaded page, newest first. */
export function selectRecentWorkflows(
  workflows: readonly WorkflowSummary[],
  limit: number = WORKFLOW_RECENT_LIMIT,
): WorkflowSummary[] {
  return [...workflows]
    .sort(
      (left, right) =>
        toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt),
    )
    .slice(0, limit);
}

/**
 * Recent only earns a section on the unfiltered first page, and only when it
 * would not simply repeat All: with `limit` or fewer workflows the page has a
 * single intent and renders All alone.
 */
export function isRecentSectionVisible({
  page,
  searchInput,
  workflowCount,
  limit = WORKFLOW_RECENT_LIMIT,
}: {
  page: number;
  searchInput: string;
  workflowCount: number;
  limit?: number;
}): boolean {
  return page === 1 && searchInput.trim() === '' && workflowCount > limit;
}
