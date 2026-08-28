import type { WorkflowExecutionStatus } from '@genfeedai/enums';
import { get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface WorkflowStep {
  id: string;
  label?: string;
  order?: number;
  type?: string;
}

export interface Workflow {
  id: string;
  createdAt?: string;
  description?: string;
  key?: string;
  label?: string;
  status?: string;
  steps?: WorkflowStep[];
  updatedAt?: string;
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
}

export interface ListWorkflowExecutionsOptions {
  limit?: number;
  status?: WorkflowExecutionStatus;
  workflowId?: string;
}

export type CreateWorkflowExecutionInput = {
  inputValues?: Record<string, unknown>;
  trigger?: string;
  workflowId: string;
};

function boundedLimit(limit = 20): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

export async function listWorkflows(options: ListWorkflowsOptions = {}): Promise<Workflow[]> {
  const query = new URLSearchParams({ limit: String(boundedLimit(options.limit)) });
  const response = await get<JsonApiCollectionResponse>(`/workflows?${query.toString()}`);
  return flattenCollection<Workflow>(response);
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const response = await get<JsonApiSingleResponse>(`/workflows/${id}`);
  return flattenSingle<Workflow>(response);
}

export async function createWorkflowExecution(
  input: CreateWorkflowExecutionInput
): Promise<WorkflowExecution> {
  const response = await post<JsonApiSingleResponse>('/workflow-executions', input);
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
