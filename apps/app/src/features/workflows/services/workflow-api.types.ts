import type {
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type {
  SystemWorkflowDuplicateMetadata,
  SystemWorkflowMetadata,
} from '@genfeedai/contracts/interfaces';
import type { WorkflowLifecycle } from '@genfeedai/workflows/contracts';
import type { NodeGroup } from '@genfeedai/workflows/ui';
import type { Edge, Node } from '@xyflow/react';

/** Full workflow data returned from the cloud API */
export interface WorkflowInputVariable {
  key: string;
  type: string;
  label: string;
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
  validation?: Record<string, unknown>;
}

export interface CloudWorkflowData {
  id: string;
  label: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  edgeStyle: string;
  groups?: NodeGroup[];
  inputVariables?: WorkflowInputVariable[];
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  lifecycle: WorkflowLifecycle;
  organizationId: string;
  brandId?: string | null;
  schedule?: string;
  timezone?: string;
  isScheduleEnabled?: boolean;
  /** Derived next fire instant (ISO). Null when disabled or unscheduled. */
  nextRunAt?: string | null;
  createdBy?: string;
  createdAt: string;
  metadata?: WorkflowMetadata;
  updatedAt: string;
}

export type WorkflowMetadata = Record<string, unknown> & {
  duplicatedFromSystemWorkflow?: SystemWorkflowDuplicateMetadata;
  systemWorkflow?: SystemWorkflowMetadata;
};

/** Lightweight workflow summary for list views */
export interface WorkflowSummary {
  id: string;
  label: string;
  description?: string;
  lifecycle: WorkflowLifecycle;
  brandId?: string | null;
  nodeCount: number;
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  updatedAt: string;
  createdAt: string;
  cloudSync?: {
    lastSyncedAt: string;
    remoteId: string;
    syncDirection: 'push' | 'pull';
  } | null;
  metadata?: WorkflowMetadata;
  schedule?: string;
  timezone?: string;
  isScheduleEnabled?: boolean;
  /** Derived next fire instant (ISO). Null when disabled or unscheduled. */
  nextRunAt?: string | null;
}

/** Payload for PATCH /workflows/:id (schedule fields) */
export interface WorkflowScheduleInput {
  isScheduleEnabled: boolean;
  /** Canonical cron expression; null removes the schedule. */
  schedule: string | null;
  timezone?: string;
}

/** Payload for creating a new workflow */
export interface CreateWorkflowInput {
  label: string;
  description?: string;
  nodes?: Node[];
  edges?: Edge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  brandId?: string | null;
  inputVariables?: WorkflowInputVariable[];
  isScheduleEnabled?: boolean;
  metadata?: Record<string, unknown>;
  schedule?: string;
  /** When `system-catalog`, installs the catalog entry named by `templateId`. */
  sourceType?: 'system-catalog' | 'seeded-template';
  templateId?: string;
  /** Clone an existing workflow via POST /workflows { sourceWorkflowId }. */
  sourceWorkflowId?: string;
  timezone?: string;
  trigger?: string;
}

/** Payload for updating an existing workflow */
export interface UpdateWorkflowInput {
  label?: string;
  description?: string;
  nodes?: Node[];
  edges?: Edge[];
  edgeStyle?: string;
  groups?: NodeGroup[];
  brandId?: string | null;
  inputVariables?: WorkflowInputVariable[];
  isScheduleEnabled?: boolean;
  metadata?: Record<string, unknown>;
  schedule?: string;
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  timezone?: string;
}

/** Options for executing a workflow */
export interface ExecuteOptions {
  expectedContextVersion?: number;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  threadId?: string;
}

export interface WorkflowActionContext {
  expectedContextVersion: number;
  threadId: string;
}

export interface ResumeExecutionResult {
  message: string;
  runId: string;
  status: WorkflowExecutionStatus;
}

/** Node-level result within an execution */
export interface ExecutionNodeResult {
  nodeId: string;
  nodeType: string;
  status: WorkflowExecutionStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  creditsUsed?: number;
  progress?: number;
  retryCount?: number;
}

export interface ExecutionEtaMetadata {
  estimatedDurationMs?: number;
  remainingDurationMs?: number;
  etaConfidence?: 'low' | 'medium' | 'high';
  currentPhase?: string;
  startedAt?: string;
  lastEtaUpdateAt?: string;
  actualDurationMs?: number;
  criticalPathNodeIds?: string[];
}

interface ExecutionMetadata extends Record<string, unknown> {
  creditsUsed?: number;
  eta?: ExecutionEtaMetadata;
}

/** Execution result returned from the API */
export interface ExecutionResult {
  id: string;
  workflowId: string;
  workflow?: { id: string; label?: string; description?: string };
  status: WorkflowExecutionStatus;
  trigger: string;
  inputValues?: Record<string, unknown>;
  nodeResults: ExecutionNodeResult[];
  progress: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  creditsUsed?: number;
  failedNodeId?: string | null;
  error?: string;
  metadata?: ExecutionMetadata;
  createdAt: string;
  updatedAt: string;
}

/** Query params for listing executions */
export interface ListExecutionsParams {
  workflowId?: string;
  brandId?: string;
  status?: WorkflowExecutionStatus;
  trigger?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// BATCH WORKFLOW TYPES
// =============================================================================

interface BatchOutputSummary {
  id: string;
  category: string;
  status?: IngredientStatus;
  ingredientUrl?: string;
  thumbnailUrl?: string;
}

export interface BatchExecutionItem {
  id: string;
  ingredientId: string;
  status: WorkflowExecutionStatus;
  executionId?: string;
  outputIngredientId?: string;
  outputCategory?: string;
  outputSummary?: BatchOutputSummary;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BatchExecution {
  id: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  items: BatchExecutionItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchExecutionSummary {
  id: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  createdAt?: string;
}

/** System catalog entry from GET /workflows?source=system-catalog (#2176) */
export interface SystemWorkflowCatalogEntry {
  canonicalId: string;
  category: string;
  changeSummary: string;
  description: string;
  family: string;
  icon?: string;
  installable: boolean;
  installed: boolean;
  installedWorkflowId: string | null;
  isScheduleEnabled: boolean;
  label: string;
  schedule?: string;
  sourceIssue: number;
  version: number;
}

/** Workflow template returned from GET /workflows/templates */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  changeSummary?: string;
  icon?: string;
  isScheduleEnabled?: boolean;
  inputVariables?: WorkflowInputVariable[];
  routine?: {
    cadence: 'daily';
    inputContract: Array<{
      defaultValue?: unknown;
      description?: string;
      key: string;
      label: string;
      required: boolean;
      type: 'boolean' | 'number' | 'select' | 'text';
    }>;
    kind: 'productized-daily-routine';
    outputDestinations: Array<{
      key: string;
      label: string;
      required: boolean;
      type: 'email' | 'social_publish' | 'task' | 'workflow_output';
    }>;
    parentIssue: number;
    recommendedSkills: string[];
    requiredSkills: string[];
    reviewDefaults: {
      autoApproveIfNoResponse: boolean;
      notifyChannels: string[];
      requireApproval: boolean;
      reviewState: 'pending_approval';
      timeoutHours: number;
    };
    sourceIssue: number;
    trackingTasks: Array<{
      description: string;
      key: string;
      outputType: 'newsletter' | 'post';
      priority: 'critical' | 'high' | 'low' | 'medium';
      reviewState: 'pending_approval';
      status: 'in_review' | 'todo';
      title: string;
    }>;
    version: number;
  };
  schedule?: string;
  nodes?: Node[];
  edges?: Edge[];
  timezone?: string;
  version?: number;
}

/** Webhook info returned from the API */
export interface WebhookInfo {
  webhookId: string | null;
  webhookUrl: string | null;
  webhookSecret?: string | null;
  authType: 'none' | 'secret' | 'bearer';
  triggerCount: number;
  lastTriggeredAt: string | null;
}

/** Execution approval response */
export interface ApprovalResponse {
  executionId: string;
  nodeId: string;
  status: 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

export interface WebhookSecretResponse {
  webhookSecret: string;
}

/** Brand summary for BrandNode dropdown */
export interface BrandSummary {
  id: string;
  label: string;
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
}
