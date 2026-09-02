import type { AgentCreditsInfo } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.types';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export async function getCreditsInfo(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<AgentCreditsInfo> {
  return api.fetchJson<AgentCreditsInfo>(
    `${api.config.baseUrl}/agent/credits`,
    { signal },
    'Failed to fetch credits info',
  );
}

export async function getActiveWorkflowExecutions(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<IWorkflowExecution[]> {
  const executions = await api.fetchCollection<IWorkflowExecution>(
    `${api.config.baseUrl}/workflow-executions?limit=100`,
    { signal },
    'Failed to fetch workflow executions',
    'Failed to deserialize workflow executions',
  );

  return executions.filter(
    (execution) =>
      execution.status === WorkflowExecutionStatus.PENDING ||
      execution.status === WorkflowExecutionStatus.RUNNING,
  );
}

export async function getWorkflowExecution(
  api: AgentBaseApiService,
  executionId: string,
  signal?: AbortSignal,
): Promise<IWorkflowExecution> {
  return api.fetchResource<IWorkflowExecution>(
    `${api.config.baseUrl}/workflow-executions/${executionId}`,
    { signal },
    'Failed to fetch workflow execution',
    'Failed to deserialize workflow execution',
  );
}

export async function cancelWorkflowExecution(
  api: AgentBaseApiService,
  executionId: string,
  signal?: AbortSignal,
): Promise<IWorkflowExecution> {
  return api.fetchResource<IWorkflowExecution>(
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

export async function getInstallReadiness(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<AgentInstallReadiness> {
  return api.fetchJson<AgentInstallReadiness>(
    `${api.config.baseUrl}/onboarding/install-readiness`,
    { signal },
    'Failed to fetch local install readiness',
  );
}
