import type {
  ManualReviewBatchPayload,
  WorkflowInterfaceField,
  WorkflowInterfaceSchema,
  WorkflowTriggerScope,
} from '@genfeedai/agent/services/agent-api.types';
import type { AgentApiError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { Effect } from 'effect';

export function getWorkflowInterfaceEffect(
  api: AgentBaseApiService,
  workflowId: string,
  signal?: AbortSignal,
): Effect.Effect<WorkflowInterfaceSchema, AgentApiError> {
  return api
    .fetchJsonEffect<{
      data?: WorkflowInterfaceSchema;
      inputs?: Record<string, WorkflowInterfaceField>;
      outputs?: Record<string, WorkflowInterfaceField>;
    }>(
      `${api.config.baseUrl}/workflows/${workflowId}/interface`,
      { signal },
      'Failed to fetch workflow interface',
    )
    .pipe(
      Effect.map(
        (json) =>
          json.data ?? {
            inputs: json.inputs ?? {},
            outputs: json.outputs ?? {},
          },
      ),
    );
}

export function triggerWorkflowEffect(
  api: AgentBaseApiService,
  workflowId: string,
  inputValues?: Record<string, unknown>,
  signal?: AbortSignal,
  scope?: WorkflowTriggerScope,
): Effect.Effect<{ id: string; status: string }, AgentApiError> {
  return api.fetchJsonEffect<{ id: string; status: string }>(
    `${api.config.baseUrl}/workflow-executions`,
    {
      body: JSON.stringify({
        inputValues: inputValues ?? {},
        ...(scope ?? {}),
        workflow: workflowId,
      }),
      method: 'POST',
      signal,
    },
    'Failed to trigger workflow',
  );
}

export function createManualReviewBatchEffect(
  api: AgentBaseApiService,
  payload: ManualReviewBatchPayload,
  signal?: AbortSignal,
): Effect.Effect<
  {
    id: string;
    items: Array<{ id: string; postId?: string }>;
  },
  AgentApiError
> {
  return api.fetchJsonEffect<{
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
