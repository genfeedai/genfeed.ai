/**
 * Workflow Store
 *
 * Unified Zustand store for workflow management.
 * Internal implementation uses slices for organization.
 */

export type {
  WorkflowData,
  WorkflowPersistenceService,
  WorkflowSaveInput,
  WorkflowState,
  WorkflowStore,
  WorkflowSummary,
} from './types';
export { useWorkflowStore } from './workflowStore';
