export type WorkflowStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed';

export interface WorkflowCreateParams {
  name: string;
  description?: string;
  templateId?: string;
  edges?: Array<Record<string, unknown>>;
  inputVariables?: Array<Record<string, unknown>>;
  nodes?: Array<Record<string, unknown>>;
  schedule?: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    startAt?: string;
    timezone?: string;
  };
}

export interface WorkflowResponse {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  edgeCount?: number;
  inputVariables?: Array<Record<string, unknown>>;
  isScheduleEnabled?: boolean;
  lifecycle?: string;
  metadata?: Record<string, unknown>;
  nodeCount?: number;
  schedule?: string;
  timezone?: string;
  version?: number;
  versionId?: string;
}

export interface WorkflowExecuteParams {
  workflowId: string;
  variables?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'started' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  results?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowListParams {
  status?: WorkflowStatus;
  limit?: number;
  offset?: number;
}

export interface WorkflowScheduleParams {
  enabled: boolean;
  schedule?: string;
  timezone?: string;
}

export interface WorkflowScheduleResponse {
  id: string;
  message?: string;
  enabled?: boolean;
  schedule?: string;
  timezone?: string;
}

export interface WorkflowRunListParams {
  workflowId?: string;
  status?: string;
  trigger?: string;
  limit?: number;
  offset?: number;
}

export interface WorkflowRunResponse {
  id: string;
  workflowId?: string;
  status?: string;
  trigger?: string;
  nodeResults?: unknown[];
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodeCount?: number;
  estimatedDuration?: string;
  creditsRequired?: number;
}

/**
 * One entry of the code-owned system workflow catalog (#2223), including
 * per-organization install state resolved by the API.
 */
export interface SystemWorkflowCatalogEntry {
  canonicalId: string;
  label: string;
  description?: string;
  family: string;
  category?: string;
  installable: boolean;
  installed: boolean;
  installedWorkflowId?: string;
  isScheduleEnabled?: boolean;
  schedule?: string;
  timezone?: string;
  version?: number;
}

export interface SystemWorkflowCatalogListParams {
  family?: string;
  includeNonInstallable?: boolean;
  installedOnly?: boolean;
}

export interface SystemWorkflowInstallParams {
  brandId?: string;
  canonicalId: string;
}
