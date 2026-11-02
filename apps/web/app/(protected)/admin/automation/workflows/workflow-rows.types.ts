import type { Workflow } from '@models/automation/workflow.model';

/** Where a workflow comes from: shipped with Genfeed, or owned by an organization. */
export type AdminWorkflowType = 'system' | 'organization';

/** The Type filter: every row, or one {@link AdminWorkflowType}. */
export type AdminWorkflowTypeFilter = 'all' | AdminWorkflowType;

/** What the catalog says about a template that has no visible persisted workflow. */
export type CatalogStatus = 'installed' | 'available' | 'systemAction';

export type AdminWorkflowSortKey = 'label' | 'type' | 'status' | 'createdAt';

/**
 * One row of the admin workflows list. System templates that were never
 * installed come from the code-owned catalog; everything else is a persisted
 * workflow, including the copies of system templates an organization installed.
 */
export interface AdminWorkflowRow {
  /** The persisted workflow behind the row; absent for a template that is not installed. */
  workflow?: Workflow;
  /** Catalog status of a template without a persisted workflow. */
  catalogStatus?: CatalogStatus;
  createdAt?: string;
  description?: string;
  family?: string;
  id: string;
  label: string;
  /** A cron expression, for system workflows that run on a schedule. */
  schedule?: string;
  trigger?: string;
  type: AdminWorkflowType;
  version?: number;
}
