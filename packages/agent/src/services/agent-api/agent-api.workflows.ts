import type {
  ManualReviewBatchPayload,
  WorkflowInterfaceField,
  WorkflowInterfaceSchema,
  WorkflowTriggerScope,
} from '@genfeedai/agent/services/agent-api.types';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';

export async function getWorkflowInterface(
  api: AgentBaseApiService,
  workflowId: string,
  signal?: AbortSignal,
): Promise<WorkflowInterfaceSchema> {
  const json = await api.fetchJson<{
    data?: WorkflowInterfaceSchema;
    inputs?: Record<string, WorkflowInterfaceField>;
    outputs?: Record<string, WorkflowInterfaceField>;
  }>(
    `${api.config.baseUrl}/workflows/${workflowId}/interface`,
    { signal },
    'Failed to fetch workflow interface',
  );

  return (
    json.data ?? {
      inputs: json.inputs ?? {},
      outputs: json.outputs ?? {},
    }
  );
}

export async function triggerWorkflow(
  api: AgentBaseApiService,
  workflowId: string,
  inputValues?: Record<string, unknown>,
  signal?: AbortSignal,
  scope?: WorkflowTriggerScope,
): Promise<{ id: string; status: string }> {
  return api.fetchJson<{ id: string; status: string }>(
    `${api.config.baseUrl}/workflow-executions`,
    {
      body: JSON.stringify({
        inputValues: inputValues ?? {},
        ...(scope ?? {}),
        workflowId,
      }),
      method: 'POST',
      signal,
    },
    'Failed to trigger workflow',
  );
}

export async function createManualReviewBatch(
  api: AgentBaseApiService,
  payload: ManualReviewBatchPayload,
  signal?: AbortSignal,
): Promise<{
  id: string;
  items: Array<{ id: string; postId?: string }>;
}> {
  return api.fetchJson<{
    id: string;
    items: Array<{ id: string; postId?: string }>;
  }>(
    `${api.config.baseUrl}/batches/manual-review`,
    {
      body: JSON.stringify(payload),
      method: 'POST',
      signal,
    },
    'Failed to create manual review batch',
  );
}
