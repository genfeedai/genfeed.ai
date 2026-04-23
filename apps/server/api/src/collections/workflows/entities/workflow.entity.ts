import {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowStep,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { WorkflowRecurrenceType } from '@genfeedai/enums';

export class WorkflowRecurrenceEntity {
  type!: WorkflowRecurrenceType;
  timezone?: string;
  endDate?: Date;
  nextRunAt?: Date;
}

export class WorkflowStepEntity {
  id!: string;
  label!: string;
  category?: WorkflowStep['category'];
  config!: Record<string, unknown>;
  dependsOn?: string[];
  status?: WorkflowStep['status'];
  output?: string;
  outputModel?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
}

export class WorkflowEntity extends BaseEntity implements WorkflowDocument {
  id!: string;
  mongoId!: string | null;
  organizationId!: string;
  userId!: string;
  user?: string;
  organization?: string;
  label!: string;
  description!: WorkflowDocument['description'];
  templateId?: string;
  trigger?: WorkflowDocument['trigger'];
  status!: WorkflowDocument['status'];
  sourceAsset?: string;
  sourceAssetModel?: string;
  steps!: WorkflowDocument['steps'];
  metadata?: Record<string, unknown>;
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  scheduledFor?: Date;
  isTemplate?: boolean;
  executionCount?: number;
  lastExecutedAt?: Date;
  recurrence?: WorkflowRecurrenceEntity;
  tags?: string[];
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
  lifecycle?: WorkflowDocument['lifecycle'];
  lockedNodeIds?: string[];
  brands?: string[];
}
