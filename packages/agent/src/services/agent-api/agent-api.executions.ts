import type { AgentCreditsInfo } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.types';
import type { AgentApiError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { Effect } from 'effect';

export function getCreditsInfoEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentCreditsInfo, AgentApiError> {
  return api.fetchJsonEffect<AgentCreditsInfo>(
    `${api.config.baseUrl}/agent/credits`,
    { signal },
    'Failed to fetch credits info',
  );
}

export function getActiveWorkflowExecutionsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<IWorkflowExecution[], AgentApiError> {
  return api
    .fetchCollectionEffect<IWorkflowExecution>(
      `${api.config.baseUrl}/workflow-executions?limit=100`,
      { signal },
      'Failed to fetch workflow executions',
      'Failed to deserialize workflow executions',
    )
    .pipe(
      Effect.map((executions) =>
        executions.filter(
          (execution) =>
            execution.status === WorkflowExecutionStatus.PENDING ||
            execution.status === WorkflowExecutionStatus.RUNNING,
        ),
      ),
    );
}

export function getWorkflowExecutionEffect(
  api: AgentBaseApiService,
  executionId: string,
  signal?: AbortSignal,
): Effect.Effect<IWorkflowExecution, AgentApiError> {
  return api.fetchResourceEffect<IWorkflowExecution>(
    `${api.config.baseUrl}/workflow-executions/${executionId}`,
    { signal },
    'Failed to fetch workflow execution',
    'Failed to deserialize workflow execution',
  );
}

export function cancelWorkflowExecutionEffect(
  api: AgentBaseApiService,
  executionId: string,
  signal?: AbortSignal,
): Effect.Effect<IWorkflowExecution, AgentApiError> {
  return api.fetchResourceEffect<IWorkflowExecution>(
    `${api.config.baseUrl}/workflow-executions/${executionId}`,
    {
      body: JSON.stringify({ status: WorkflowExecutionStatus.CANCELLED }),
      method: 'PATCH',
      signal,
    },
    'Failed to cancel workflow execution',
    'Failed to deserialize workflow execution',
  );
}

export function getInstallReadinessEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentInstallReadiness, AgentApiError> {
  return api.fetchJsonEffect<AgentInstallReadiness>(
    `${api.config.baseUrl}/onboarding/install-readiness`,
    { signal },
    'Failed to fetch local install readiness',
  );
}
