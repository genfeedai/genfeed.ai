import type { WorkflowInterface } from '@genfeedai/contracts/types';
import type { WorkflowRefApi } from '../../provider/types';
import { getWorkflowLogger } from '../../stores/executionLogger';

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
