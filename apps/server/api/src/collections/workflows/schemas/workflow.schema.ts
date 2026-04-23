import type {
  Workflow as PrismaWorkflow,
  WorkflowExecution as PrismaWorkflowExecution,
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

export type WorkflowStep = {
  id: string;
  label: string;
  name?: string;
  category?: string;
  config: Record<string, unknown>;
  dependsOn?: string[];
  status?: string;
  output?: string;
  outputModel?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  [key: string]: unknown;
};

export interface WorkflowDocument
  extends Omit<
    PrismaWorkflow,
    'config' | 'edges' | 'inputVariables' | 'nodes' | 'steps'
  > {
  _id: string;
  organization?: string;
  user?: string;
  name?: string | null;
  trigger?: string;
  sourceAsset?: string | null;
  sourceAssetModel?: string | null;
  steps: WorkflowStep[];
  nodes: WorkflowVisualNode[];
  edges: WorkflowEdge[];
  inputVariables: WorkflowInputVariable[];
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
  brands?: string[];
  webhookAuthType?: string | null;
  webhookId?: string | null;
  webhookSecret?: string | null;
  webhookTriggerCount?: number;
  webhookLastTriggeredAt?: Date | null;
  comfyuiTemplate?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type Workflow = WorkflowDocument;
