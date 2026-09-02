import type { WorkflowInterface } from '@genfeedai/contracts/types';
import { getWorkflowLogger } from '../../stores/executionLogger';

export interface ReferencableWorkflow {
  id: string;
  label: string;
  description?: string;
  interface: WorkflowInterface;
}

/**
 * API adapter for WorkflowRefNode.
 * Host apps inject this through `WorkflowUIConfig.workflowReferences`.
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
    getWorkflowLogger().error(
      '[workflow-ui] WorkflowRefApi not configured: fetchReferencableWorkflows',
    );
    return [];
  },
  fetchWorkflowInterface: async () => {
    getWorkflowLogger().error(
      '[workflow-ui] WorkflowRefApi not configured: fetchWorkflowInterface',
    );
    return { inputs: [], outputs: [] } as WorkflowInterface;
  },
  validateReference: async () => {
    getWorkflowLogger().error(
      '[workflow-ui] WorkflowRefApi not configured: validateReference',
    );
  },
};

export let workflowRefApi: WorkflowRefApi = noopApi;

/** Configure the workflow-reference API, resetting to the safe default when absent. */
export function configureWorkflowRefApi(api?: WorkflowRefApi): void {
  workflowRefApi = api ?? noopApi;
}
