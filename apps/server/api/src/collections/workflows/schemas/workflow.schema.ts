import type {
  Workflow as PrismaWorkflow,
  WorkflowExecution as PrismaWorkflowExecution,
  WorkflowVersion as PrismaWorkflowVersion,
} from '@genfeedai/prisma';

export type { PrismaWorkflowExecution as WorkflowExecutionDocument };

export type WorkflowRecurrence = {
  type: string;
  timezone?: string;
  endDate?: Date;
  nextRunAt?: Date;
};

export type WorkflowVisualNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
    inputVariableKeys?: string[];
  };
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type WorkflowInputVariableValidation = {
  min?: number;
  max?: number;
  options?: string[];
  pattern?: string;
  [key: string]: unknown;
};

export type WorkflowInputVariable = {
  key: string;
  type: string;
  label: string;
  description?: string;
  defaultValue?: unknown;
  required: boolean;
  validation?: WorkflowInputVariableValidation;
};

export type WorkflowVersionGraph = {
  edges: WorkflowEdge[];
  lockedNodeIds: string[];
  nodes: WorkflowVisualNode[];
};

export type WorkflowVersionDocument = Omit<
  PrismaWorkflowVersion,
  'graph' | 'inputSchema'
> & {
  graph: WorkflowVersionGraph;
  inputSchema: WorkflowInputVariable[];
};

export interface WorkflowDocument
  extends Omit<
    PrismaWorkflow,
    | 'config'
    | 'metadata'
    | 'progress'
    | 'startedAt'
    | 'completedAt'
    | 'executionCount'
    | 'lastExecutedAt'
    | 'recurrence'
    | 'thumbnail'
    | 'thumbnailNodeId'
    | 'schedule'
    | 'timezone'
    | 'isScheduleEnabled'
    | 'lifecycle'
  > {
  trigger: string | null;
  sourceAsset?: string | null;
  sourceAssetModel?: string | null;
  nodes: WorkflowVisualNode[];
  edges: WorkflowEdge[];
  inputVariables: WorkflowInputVariable[];
  versionId: string;
  version: number;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  progress?: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  scheduledFor?: Date | null;
  isTemplate?: boolean;
  executionCount?: number;
  lastExecutedAt?: Date | null;
  recurrence?: WorkflowRecurrence;
  tags?: string[];
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  schedule?: string | null;
  timezone?: string | null;
  isScheduleEnabled?: boolean;
  isPublic?: boolean;
  lifecycle?: string;
  lockedNodeIds?: string[];
  webhookAuthType?: string | null;
  webhookId?: string | null;
  webhookSecret?: string | null;
  webhookTriggerCount?: number;
  webhookLastTriggeredAt?: Date | null;
  comfyuiTemplate?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type Workflow = WorkflowDocument;
