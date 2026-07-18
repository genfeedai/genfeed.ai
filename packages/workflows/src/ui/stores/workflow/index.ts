/**
 * Workflow Store
 *
 * Unified Zustand store for workflow management.
 * Internal implementation uses slices for organization.
 */

export {
  configureApplyEditOperations,
  getApplyEditOperations,
} from './applyEditOperations';
export type {
  WorkflowData,
  WorkflowPersistenceService,
  WorkflowSaveInput,
  WorkflowState,
  WorkflowStore,
  WorkflowSummary,
} from './types';
export {
  configureWorkflowPersistence,
  getWorkflowPersistence,
} from './workflowPersistence';
export { useWorkflowStore } from './workflowStore';
