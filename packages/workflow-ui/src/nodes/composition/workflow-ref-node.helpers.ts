import type { WorkflowInterface } from '@genfeedai/types';

export interface ReferencableWorkflow {
  _id: string;
  name: string;
  description?: string;
  interface: WorkflowInterface;
}

/**
 * API adapter for WorkflowRefNode.
 * Host apps must call `setWorkflowRefApi()` to provide implementations.
 */
export interface WorkflowRefApi {
  fetchReferencableWorkflows: (
    excludeId?: string | null,
    signal?: AbortSignal,
  ) => Promise<ReferencableWorkflow[]>;
  validateReference: (
    parentWorkflowId: string,
    childWorkflowId: string,
  ) => Promise<void>;
  fetchWorkflowInterface: (workflowId: string) => Promise<WorkflowInterface>;
}

const noopApi: WorkflowRefApi = {
  fetchReferencableWorkflows: async () => {
    console.warn(
      '[workflow-ui] WorkflowRefApi not configured: fetchReferencableWorkflows',
    );
    return [];
  },
  fetchWorkflowInterface: async () => {
    console.warn(
      '[workflow-ui] WorkflowRefApi not configured: fetchWorkflowInterface',
    );
    return { inputs: [], outputs: [] } as WorkflowInterface;
  },
  validateReference: async () => {
    console.warn(
      '[workflow-ui] WorkflowRefApi not configured: validateReference',
    );
  },
};

export let workflowRefApi: WorkflowRefApi = noopApi;

/** Host apps call this to wire up the API layer for WorkflowRefNode. */
export function setWorkflowRefApi(api: WorkflowRefApi): void {
  workflowRefApi = api;
}
