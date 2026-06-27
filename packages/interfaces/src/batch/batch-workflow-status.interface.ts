/**
 * Response shapes for the workflow batch-execution status endpoints.
 * Extracted out of `WorkflowsController` (the inline `getBatchStatus` return
 * type) so controller signatures stay free of inline response interfaces.
 */

export interface BatchWorkflowStatusItemOutputSummary {
  id: string;
  category: string;
  status?: string;
  ingredientUrl?: string;
  thumbnailUrl?: string;
}

export interface BatchWorkflowStatusItem {
  _id: string;
  ingredientId: string;
  status: string;
  executionId?: string;
  outputIngredientId?: string;
  outputCategory?: string;
  outputSummary?: BatchWorkflowStatusItemOutputSummary;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BatchWorkflowStatusResponse {
  _id: string;
  workflowId: string;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  items: BatchWorkflowStatusItem[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Condensed batch-job row returned by the `GET workflows/batch` listing.
 */
export interface BatchWorkflowSummary {
  _id: string;
  workflowId: string;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  createdAt?: string;
}
