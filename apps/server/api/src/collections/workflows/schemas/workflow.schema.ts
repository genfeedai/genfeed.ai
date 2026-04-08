import {
  WorkflowLifecycle,
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
  WorkflowTrigger,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type WorkflowDocument = Workflow & Document;

@Schema({ _id: false })
export class WorkflowRecurrence {
  @Prop({
    default: WorkflowRecurrenceType.ONCE,
    enum: Object.values(WorkflowRecurrenceType),
    type: String,
  })
  type!: WorkflowRecurrenceType;

  @Prop({ required: false, type: String })
  timezone?: string;

  @Prop({ required: false, type: Date })
  endDate?: Date;

  @Prop({ required: false, type: Date })
  nextRunAt?: Date;
}

@Schema({ _id: false })
export class WorkflowStep {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({
    enum: Object.values(WorkflowStepCategory),
    required: true,
    type: String,
  })
  category!: WorkflowStepCategory;

  @Prop({ type: Object })
  config!: Record<string, unknown>;

  @Prop({ default: [], type: [String] })
  dependsOn!: string[];

  @Prop({
    default: WorkflowStepStatus.PENDING,
    enum: Object.values(WorkflowStepStatus),
    type: String,
  })
  status!: WorkflowStepStatus;

  @Prop({
    refPath: 'steps.outputModel',
    type: Types.ObjectId,
  })
  output?: Types.ObjectId;

  @Prop({
    enum: ['Video', 'Image', 'Asset', 'Post'],
    type: String,
  })
  outputModel?: string;

  @Prop({
    required: false,
    type: String,
  })
  error?: string;

  @Prop({
    type: Date,
  })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progress?: number;
}

// =============================================================================
// VISUAL BUILDER SCHEMAS
// =============================================================================

@Schema({ _id: false })
export class WorkflowNodePosition {
  @Prop({ required: true, type: Number })
  x!: number;

  @Prop({ required: true, type: Number })
  y!: number;
}

@Schema({ _id: false })
export class WorkflowNodeData {
  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ default: {}, type: Object })
  config!: Record<string, unknown>;

  @Prop({ default: [], type: [String] })
  inputVariableKeys?: string[];
}

@Schema({ _id: false })
export class WorkflowVisualNode {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: WorkflowNodePosition })
  position!: WorkflowNodePosition;

  @Prop({ required: true, type: WorkflowNodeData })
  data!: WorkflowNodeData;
}

@Schema({ _id: false })
export class WorkflowEdge {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  source!: string;

  @Prop({ required: true, type: String })
  target!: string;

  @Prop({ type: String })
  sourceHandle?: string;

  @Prop({ type: String })
  targetHandle?: string;
}

@Schema({ _id: false })
export class WorkflowInputVariableValidation {
  @Prop({ type: Number })
  min?: number;

  @Prop({ type: Number })
  max?: number;

  @Prop({ type: [String] })
  options?: string[];

  @Prop({ type: String })
  pattern?: string;
}

@Schema({ _id: false })
export class WorkflowInputVariable {
  @Prop({ required: true, type: String })
  key!: string;

  @Prop({
    enum: [
      'image',
      'video',
      'audio',
      'text',
      'number',
      'select',
      'asset',
      'boolean',
    ],
    required: true,
    type: String,
  })
  type!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Object })
  defaultValue?: unknown;

  @Prop({ default: false, type: Boolean })
  required!: boolean;

  @Prop({ type: WorkflowInputVariableValidation })
  validation?: WorkflowInputVariableValidation;
}

// =============================================================================
// MAIN WORKFLOW SCHEMA
// =============================================================================

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'workflows',
  timestamps: true,
  versionKey: false,
})
export class Workflow {
  _id!: string;

  @Prop({ type: String })
  name?: string;

  @Prop({ type: String })
  description?: string;

  @Prop({
    ref: 'User',
    required: false,
    type: Types.ObjectId,
  })
  user?: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  //   //   description?: string;

  @Prop({ required: false, type: String })
  templateId?: string;

  @Prop({
    default: WorkflowTrigger.MANUAL,
    enum: Object.values(WorkflowTrigger),
    required: true,
    type: String,
  })
  trigger!: WorkflowTrigger;

  @Prop({
    default: WorkflowStatus.DRAFT,
    enum: Object.values(WorkflowStatus),
    required: true,
    type: String,
  })
  status!: WorkflowStatus;

  @Prop({ refPath: 'sourceAssetModel', type: Types.ObjectId })
  sourceAsset?: Types.ObjectId;

  @Prop({ enum: ['Video', 'Image', 'Asset'], type: String })
  sourceAssetModel?: string;

  @Prop({ default: [], type: [WorkflowStep] })
  steps!: WorkflowStep[];

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progress!: number;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  scheduledFor?: Date;

  @Prop({ default: false, type: Boolean })
  isTemplate!: boolean;

  @Prop({
    type: {
      lastSyncedAt: { type: Date, required: true },
      remoteAccountId: { type: String, required: true },
      remoteId: { type: String, required: true },
      remoteOrgId: { type: String, required: true },
      syncDirection: { type: String, enum: ['push', 'pull'], required: true },
    },
    default: null,
  })
  cloudSync: {
    lastSyncedAt: Date;
    remoteAccountId: string;
    remoteId: string;
    remoteOrgId: string;
    syncDirection: 'push' | 'pull';
  } | null;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: 0, type: Number })
  executionCount!: number;

  @Prop({ type: Date })
  lastExecutedAt?: Date;

  @Prop({ required: false, type: WorkflowRecurrence })
  recurrence?: WorkflowRecurrence;

  @Prop({
    default: [],
    ref: 'Tag',
    type: [Types.ObjectId],
  })
  tags!: Types.ObjectId[];

  // =============================================================================
  // VISUAL BUILDER FIELDS
  // =============================================================================

  @Prop({ default: [], type: [WorkflowVisualNode] })
  nodes!: WorkflowVisualNode[];

  @Prop({ default: [], type: [WorkflowEdge] })
  edges!: WorkflowEdge[];

  @Prop({ default: [], type: [WorkflowInputVariable] })
  inputVariables!: WorkflowInputVariable[];

  @Prop({ type: String })
  thumbnail?: string | null;

  @Prop({ type: String })
  thumbnailNodeId?: string | null;

  @Prop({ type: String })
  schedule?: string;

  @Prop({ type: String })
  timezone?: string;

  @Prop({ default: false, type: Boolean })
  isScheduleEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isPublic!: boolean;

  // =============================================================================
  // NEW WORKFLOW ENGINE FIELDS
  // =============================================================================

  @Prop({
    default: WorkflowLifecycle.DRAFT,
    enum: Object.values(WorkflowLifecycle),
    type: String,
  })
  lifecycle!: WorkflowLifecycle;

  @Prop({ default: [], type: [String] })
  lockedNodeIds!: string[];

  @Prop({
    default: [],
    ref: 'Brand',
    type: [Types.ObjectId],
  })
  brands!: Types.ObjectId[];

  // =============================================================================
  // WEBHOOK TRIGGER FIELDS
  // =============================================================================

  @Prop({ type: String })
  webhookId?: string;

  @Prop({ type: String })
  webhookSecret?: string;

  @Prop({
    default: 'secret',
    enum: ['none', 'secret', 'bearer'],
    type: String,
  })
  webhookAuthType!: 'none' | 'secret' | 'bearer';

  @Prop({ type: Date })
  webhookLastTriggeredAt?: Date;

  @Prop({ default: 0, type: Number })
  webhookTriggerCount!: number;

  // =============================================================================
  // COMFYUI TEMPLATE (optional — for workflows that support ComfyUI export)
  // =============================================================================

  @Prop({ required: false, type: Object })
  comfyuiTemplate?: Record<string, unknown>;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
