import {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { BaseEntity } from '@api/entities/base.entity';
import { WorkflowRecurrenceType } from '@genfeedai/contracts';

export class WorkflowRecurrenceEntity {
  type!: WorkflowRecurrenceType;
  timezone?: string;
  endDate?: Date;
  nextRunAt?: Date;
}

export class WorkflowEntity extends BaseEntity implements WorkflowDocument {
  declare id: string;
  declare defaultRecurringBrandId: string | null;
  declare organizationId: string;
  declare brandId: string | null;
  declare userId: string;
  declare currentVersionId: string;
  declare label: string;
  declare description: WorkflowDocument['description'];
  declare templateId?: string;
  declare trigger: WorkflowDocument['trigger'];
  declare status: WorkflowDocument['status'];
  declare sourceAsset?: string;
  declare sourceAssetModel?: string;
  declare metadata?: Record<string, unknown>;
  declare progress?: number;
  declare startedAt?: Date;
  declare completedAt?: Date;
  declare scheduledFor?: Date;
  declare isTemplate?: boolean;
  declare executionCount?: number;
  declare lastExecutedAt?: Date;
  declare recurrence?: WorkflowRecurrenceEntity;
  declare tags?: string[];
  declare nodes: WorkflowVisualNode[];
  declare edges: WorkflowEdge[];
  declare inputVariables: WorkflowInputVariable[];
  declare versionId: string;
  declare version: number;
  declare thumbnail?: string | null;
  declare thumbnailNodeId?: string | null;
  declare schedule?: string;
  declare timezone?: string;
  declare isScheduleEnabled: boolean;
  declare isPublic: boolean;

  declare lifecycle?: WorkflowDocument['lifecycle'];
  declare lockedNodeIds?: string[];
}
