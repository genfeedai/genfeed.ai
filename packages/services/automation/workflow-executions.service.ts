import {
  type AgentFailureReason,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { WorkflowExecutionListQueryParams } from '@genfeedai/contracts/types';
import { EnvironmentService } from '@services/core/environment.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';

const instances = new ServiceInstanceManager<WorkflowExecutionsServiceClass>();

class WorkflowExecutionsServiceClass {
  constructor(
    private readonly baseURL: string,
    private readonly token: string,
  ) {}

  private async request(
    endpoint: string,
    init?: RequestInit,
  ): Promise<JsonApiResponseDocument> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    if (!response.ok) {
      const error = new Error(`Workflow execution request failed: ${endpoint}`);
      logger.error('Workflow execution request failed', { endpoint, error });
      throw error;
    }

    return response.json();
  }

  async list(
    params: WorkflowExecutionListQueryParams = {},
  ): Promise<IWorkflowExecution[]> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const document = await this.request(`/workflow-executions${suffix}`);
    return deserializeCollection<IWorkflowExecution>(document);
  }

  async listAdminFailures(
    failureReason: AgentFailureReason | undefined,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<IWorkflowExecution[]> {
    const query = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (failureReason) query.set('failureReason', failureReason);
    const document = await this.request(
      `/workflow-executions/admin/failures?${query}`,
      { signal },
    );
    return deserializeCollection<IWorkflowExecution>(document);
  }

  async getById(id: string): Promise<IWorkflowExecution> {
    const document = await this.request(`/workflow-executions/${id}`);
    return deserializeResource<IWorkflowExecution>(document);
  }

  async cancel(id: string): Promise<IWorkflowExecution> {
    const document = await this.request(`/workflow-executions/${id}`, {
      body: JSON.stringify({ status: WorkflowExecutionStatus.CANCELLED }),
      method: 'PATCH',
    });
    return deserializeResource<IWorkflowExecution>(document);
  }
}

export class WorkflowExecutionsService {
  static getInstance(token: string): WorkflowExecutionsServiceClass {
    const cached = instances.get(WorkflowExecutionsService, token);
    if (cached) return cached;

    const instance = new WorkflowExecutionsServiceClass(
      EnvironmentService.apiEndpoint,
      token,
    );
    instances.set(WorkflowExecutionsService, token, instance);
    return instance;
  }

  static clearInstance(token: string): void {
    instances.clear(WorkflowExecutionsService, token);
  }
}
