import {
  Workflow,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  WorkflowLifecycle,
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
  WorkflowTrigger,
} from '@genfeedai/enums';

export class WorkflowRecurrenceEntity {
  type!: WorkflowRecurrenceType;
  timezone?: string;
  endDate?: Date;
  nextRunAt?: Date;
}

export class WorkflowStepEntity {
  id!: string;
  label!: string;
  category!: WorkflowStepCategory;
  config!: Record<string, unknown>;
  dependsOn!: string[];
  status!: WorkflowStepStatus;
  output?: string;
  outputModel?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
}

// @ts-expect-error - implements via BaseEntity + explicit fields
export class WorkflowEntity extends BaseEntity implements Workflow {
  user?: string;
  organization?: string;
  label!: string;
  description?: string;
  templateId?: string;
  trigger!: WorkflowTrigger;
  status!: WorkflowStatus;
  sourceAsset?: string;
  sourceAssetModel?: string;
  steps!: WorkflowStepEntity[];
  metadata?: Record<string, unknown>;
  progress!: number;
  startedAt?: Date;
  completedAt?: Date;
  scheduledFor?: Date;
  isTemplate!: boolean;
  executionCount!: number;
  lastExecutedAt?: Date;
  recurrence?: WorkflowRecurrenceEntity;
  tags!: string[];
  nodes!: WorkflowVisualNode[];
  edges!: WorkflowEdge[];
  inputVariables!: WorkflowInputVariable[];
  thumbnail?: string | null;
  thumbnailNodeId?: string | null;
  schedule?: string;
  timezone?: string;
  isScheduleEnabled!: boolean;
  isPublic!: boolean;

  // New workflow engine fields
  lifecycle!: WorkflowLifecycle;
  lockedNodeIds!: string[];
  brands!: string[];
}
