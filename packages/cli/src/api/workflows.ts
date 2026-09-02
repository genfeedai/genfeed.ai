import type { WorkflowExecutionStatus, WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface WorkflowNode {
  id: string;
  data?: { label?: string };
  type: string;
}

export interface Workflow {
  id: string;
  createdAt?: string;
  description?: string;
  key?: string;
  label?: string;
  nodes?: WorkflowNode[];
  status?: string;
  updatedAt?: string;
  version?: number;
  versionId?: string;
}

export interface WorkflowExecution {
  id: string;
  completedAt?: string;
  createdAt?: string;
  error?: string;
  inputValues?: Record<string, unknown>;
  startedAt?: string;
  status?: string;
  trigger?: string;
  workflow?: Pick<Workflow, 'description' | 'id' | 'label'>;
  workflowId?: string;
}

export interface ListWorkflowsOptions {
  limit?: number;
  page?: number;
}

export interface ListWorkflowExecutionsOptions {
  limit?: number;
  status?: WorkflowExecutionStatus;
  workflowId?: string;
}

export type CreateWorkflowExecutionInput = {
  inputValues?: Record<string, unknown>;
  trigger?: WorkflowExecutionTrigger;
  workflowId: string;
};

function boundedLimit(limit = 20): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

export async function listWorkflows(
  options: ListWorkflowsOptions = {},
  signal?: AbortSignal
): Promise<Workflow[]> {
  const query = new URLSearchParams({ limit: String(boundedLimit(options.limit)) });
  if (options.page && options.page > 1) {
    query.set('page', String(Math.trunc(options.page)));
  }
  const path = `/workflows?${query.toString()}`;
  const response = signal
    ? await get<JsonApiCollectionResponse>(path, { signal })
    : await get<JsonApiCollectionResponse>(path);
  return flattenCollection<Workflow>(response);
}

export async function getWorkflow(id: string, signal?: AbortSignal): Promise<Workflow> {
  const path = `/workflows/${id}`;
  const response = signal
    ? await get<JsonApiSingleResponse>(path, { signal })
    : await get<JsonApiSingleResponse>(path);
  return flattenSingle<Workflow>(response);
}

export async function createWorkflowExecution(
  input: CreateWorkflowExecutionInput,
  signal?: AbortSignal
): Promise<WorkflowExecution> {
  const response = signal
    ? await post<JsonApiSingleResponse>('/workflow-executions', input, { signal })
    : await post<JsonApiSingleResponse>('/workflow-executions', input);
  return flattenSingle<WorkflowExecution>(response);
}

export async function listWorkflowExecutions(
  options: ListWorkflowExecutionsOptions = {}
): Promise<WorkflowExecution[]> {
  const query = new URLSearchParams({ limit: String(boundedLimit(options.limit)) });
  if (options.status) {
    query.set('status', options.status);
  }
  if (options.workflowId) {
    query.set('workflowId', options.workflowId);
  }
  const response = await get<JsonApiCollectionResponse>(`/workflow-executions?${query.toString()}`);
  return flattenCollection<WorkflowExecution>(response);
}

export async function getWorkflowExecution(id: string): Promise<WorkflowExecution> {
  const response = await get<JsonApiSingleResponse>(`/workflow-executions/${id}`);
  return flattenSingle<WorkflowExecution>(response);
}
