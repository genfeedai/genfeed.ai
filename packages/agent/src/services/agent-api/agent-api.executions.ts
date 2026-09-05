import type { AgentCreditsInfo } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.types';
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
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

export interface ActiveWorkflowExecutionScope {
  threadId: string;
  executionId?: string;
}

export async function getActiveWorkflowExecutions(
  api: AgentBaseApiService,
  signal?: AbortSignal,
  scope?: ActiveWorkflowExecutionScope,
): Promise<IWorkflowExecution[]> {
  const isActive = (execution: IWorkflowExecution) =>
    execution.status === WorkflowExecutionStatus.PENDING ||
    execution.status === WorkflowExecutionStatus.RUNNING;

  if (scope?.executionId) {
    try {
      const execution = await getWorkflowExecution(
        api,
        scope.executionId,
        signal,
      );
      if (
        execution.metadata?.threadId === scope.threadId &&
        isActive(execution)
      ) {
        return [execution];
      }
    } catch (error) {
      if (!(error instanceof AgentApiRequestError && error.status === 404)) {
        throw error;
      }
    }
  }

  const pageSize = 100;
  const executions = new Map<string, IWorkflowExecution>();
  for (const status of [
    WorkflowExecutionStatus.PENDING,
    WorkflowExecutionStatus.RUNNING,
  ]) {
    let offset = 0;
    let page: IWorkflowExecution[];
    do {
      signal?.throwIfAborted();
      const query = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        status,
      });
      page = await api.fetchCollection<IWorkflowExecution>(
        `${api.config.baseUrl}/workflow-executions?${query}`,
        { signal },
        'Failed to fetch workflow executions',
        'Failed to deserialize workflow executions',
      );
      for (const execution of page) {
        if (
          isActive(execution) &&
          (!scope || execution.metadata?.threadId === scope.threadId)
        ) {
          executions.set(execution.id, execution);
        }
      }
      offset += page.length;
    } while (page.length === pageSize);
  }
  return [...executions.values()];
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
