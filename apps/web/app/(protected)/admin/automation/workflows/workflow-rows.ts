import { getSystemWorkflowMetadata } from '@genfeedai/contracts/interfaces';
import type { Workflow } from '@models/automation/workflow.model';
import type {
  AdminWorkflowRow,
  AdminWorkflowSortKey,
  AdminWorkflowTypeFilter,
  CatalogStatus,
} from '@props/admin/admin-workflow-row.props';
import type { SystemWorkflowCatalogEntry } from '@/features/workflows/services/workflow-api.types';

export const WORKFLOW_SORT_KEYS: readonly AdminWorkflowSortKey[] = [
  'label',
  'type',
  'status',
  'createdAt',
];

export function getCatalogStatus(
  entry: SystemWorkflowCatalogEntry,
): CatalogStatus {
  if (entry.installed) {
    return 'installed';
  }
  return entry.installable ? 'available' : 'systemAction';
}

function formatFamily(family: string): string {
  return family.replaceAll('-', ' ');
}

/**
 * Merges persisted workflows and the system catalog into one list.
 *
 * A system template an organization installed is already a persisted workflow
 * (a copy carrying system metadata), so it is listed once, from the workflow.
 * A catalog entry only becomes its own row while no visible workflow stands for it.
 */
export function buildWorkflowRows(
  workflows: readonly Workflow[],
  catalog: readonly SystemWorkflowCatalogEntry[],
): AdminWorkflowRow[] {
  const persistedIds = new Set(workflows.map((workflow) => workflow.id));
  const catalogById = new Map(
    catalog.map((entry) => [entry.canonicalId, entry]),
  );

  const workflowRows = workflows.map((workflow): AdminWorkflowRow => {
    const system = getSystemWorkflowMetadata(workflow.metadata);
    const template = system ? catalogById.get(system.canonicalId) : undefined;
    return {
      createdAt: workflow.createdAt,
      description: workflow.description || undefined,
      family: template ? formatFamily(template.family) : undefined,
      id: workflow.id,
      label: workflow.label,
      schedule: workflow.schedule ?? template?.schedule,
      trigger: workflow.trigger,
      type: system ? 'system' : 'organization',
      version: system?.version,
      workflow,
    };
  });

  const templateRows = catalog
    .filter(
      (entry) =>
        !entry.installedWorkflowId ||
        !persistedIds.has(entry.installedWorkflowId),
    )
    .map(
      (entry): AdminWorkflowRow => ({
        catalogStatus: getCatalogStatus(entry),
        description: entry.description || undefined,
        family: formatFamily(entry.family),
        id: `catalog:${entry.canonicalId}`,
        label: entry.label,
        schedule: entry.schedule,
        type: 'system',
        version: entry.version,
      }),
    );

  return [...templateRows, ...workflowRows];
}

export function filterWorkflowRows(
  rows: readonly AdminWorkflowRow[],
  type: AdminWorkflowTypeFilter,
  search: string,
): AdminWorkflowRow[] {
  const term = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (type !== 'all' && row.type !== type) {
      return false;
    }
    if (!term) {
      return true;
    }
    // Persisted workflows were already searched by the API; templates were not.
    return (
      row.workflow !== undefined ||
      [row.label, row.description, row.family].some((value) =>
        value?.toLowerCase().includes(term),
      )
    );
  });
}

function getStatusValue(row: AdminWorkflowRow): string {
  return row.workflow?.status ?? row.catalogStatus ?? '';
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function compareCreatedAt(left: AdminWorkflowRow, right: AdminWorkflowRow) {
  // Templates have no creation date: they sort after dated workflows.
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.NaN;
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }
  if (Number.isNaN(leftTime)) {
    return 1;
  }
  if (Number.isNaN(rightTime)) {
    return -1;
  }
  return rightTime - leftTime;
}

/**
 * With no sort chosen, system workflows come first and each group is newest
 * first. A chosen column sorts the whole list, with the label as tie-breaker.
 */
export function sortWorkflowRows(
  rows: readonly AdminWorkflowRow[],
  sortKey: string | undefined,
  direction: 'asc' | 'desc',
): AdminWorkflowRow[] {
  const sign = direction === 'desc' ? -1 : 1;
  const byLabel = (left: AdminWorkflowRow, right: AdminWorkflowRow) =>
    compareText(left.label, right.label);

  return [...rows].sort((left, right) => {
    switch (sortKey) {
      case 'label':
        return sign * byLabel(left, right);
      case 'type':
        return (
          sign * compareText(left.type, right.type) || byLabel(left, right)
        );
      case 'status':
        return (
          sign * compareText(getStatusValue(left), getStatusValue(right)) ||
          byLabel(left, right)
        );
      case 'createdAt':
        // Undated templates stay last whichever way the column is sorted.
        if (!left.createdAt || !right.createdAt) {
          return compareCreatedAt(left, right);
        }
        return -sign * compareCreatedAt(left, right) || byLabel(left, right);
      default:
        if (left.type !== right.type) {
          return left.type === 'system' ? -1 : 1;
        }
        return compareCreatedAt(left, right) || byLabel(left, right);
    }
  });
}

export function getPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The 1-based page, kept inside what exists so a stale `?page=` never shows nothing. */
export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), pageCount);
}
