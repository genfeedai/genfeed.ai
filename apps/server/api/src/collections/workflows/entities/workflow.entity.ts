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
  declare id: string;
  declare mongoId: string | null;
  declare defaultRecurringBrandId: string | null;
  declare organizationId: string;
  declare brandId: string | null;
  declare userId: string;
  // Every field below is populated exclusively by BaseEntity's
  // `Object.assign(this, partial)` constructor call. Under this codebase's
  // spec-compliant class-field ("define") transpilation, a plain field
  // declaration with no initializer re-runs after `super()` returns and
  // resets the assigned value back to `undefined` — silently discarding
  // everything Object.assign just set. `declare` fields emit zero runtime
  // code, so they cannot clobber the constructor's assignment. See
  // .agents/memory/rules/prisma_legacy_alias_fields.md and the identical
  // pattern in post.entity.ts / post-analytics.entity.ts.
  declare brand?: string | null;
  declare user?: string;
  declare organization?: string;
  declare label: string;
  declare description: WorkflowDocument['description'];
  declare templateId?: string;
  declare trigger?: WorkflowDocument['trigger'];
  declare status: WorkflowDocument['status'];
  declare sourceAsset?: string;
  declare sourceAssetModel?: string;
  declare steps: WorkflowDocument['steps'];
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
  declare thumbnail?: string | null;
  declare thumbnailNodeId?: string | null;
  declare schedule?: string;
  declare timezone?: string;
  declare isScheduleEnabled: boolean;
  declare isPublic: boolean;

  // New workflow engine fields
  declare lifecycle?: WorkflowDocument['lifecycle'];
  declare lockedNodeIds?: string[];
}
