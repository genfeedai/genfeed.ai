import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'failed',
  'cancelled',
] as const;

export const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export const TASK_LINKED_ENTITY_MODELS = [
  'Ingredient',
  'Post',
  'Article',
  'Evaluation',
] as const;

export const TASK_OUTPUT_TYPES = [
  'caption',
  'image',
  'ingredient',
  'newsletter',
  'post',
  'video',
] as const;

export const TASK_REVIEW_STATES = [
  'none',
  'pending_approval',
  'approved',
  'changes_requested',
  'dismissed',
] as const;

export const TASK_EXECUTION_PATHS = [
  'agent_orchestrator',
  'caption_generation',
  'image_generation',
  'video_generation',
] as const;

export type TaskLinkedEntityModel = (typeof TASK_LINKED_ENTITY_MODELS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskOutputType = (typeof TASK_OUTPUT_TYPES)[number];
export type TaskReviewState = (typeof TASK_REVIEW_STATES)[number];
export type TaskExecutionPath = (typeof TASK_EXECUTION_PATHS)[number];
export type TaskDocument = Task & Document;

export interface TaskDecompositionSubtask {
  agentType: string;
  brief: string;
  label: string;
  order: number;
}

export interface TaskDecomposition {
  isSingleAgent: boolean;
  subtasks: TaskDecompositionSubtask[];
  summary: string;
}

export interface TaskProgress {
  activeRunCount: number;
  message: string;
  percent: number;
  stage: string;
}

export interface TaskEventStreamEntry {
  createdAt: Date;
  payload?: Record<string, unknown>;
  type: string;
  userId?: string;
}

@Schema({
  collection: 'tasks',
  timestamps: true,
  versionKey: false,
})
export class Task {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, type: Number })
  taskNumber!: number;

  @Prop({ required: true, type: String })
  identifier!: string;

  @Prop({ required: true, trim: true, type: String })
  title!: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({
    default: 'backlog',
    enum: TASK_STATUSES,
    type: String,
  })
  status!: TaskStatus;

  @Prop({
    default: 'medium',
    enum: TASK_PRIORITIES,
    type: String,
  })
  priority!: TaskPriority;

  @Prop({ ref: 'Task', required: false, type: Types.ObjectId })
  parentId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  projectId?: string;

  @Prop({ required: false, type: String })
  goalId?: string;

  @Prop({ required: false, type: String })
  assigneeUserId?: string;

  @Prop({ required: false, type: String })
  assigneeAgentId?: string;

  @Prop({ required: false, type: String })
  checkoutRunId?: string;

  @Prop({ required: false, type: String })
  checkoutAgentId?: string;

  @Prop({ required: false, type: Date })
  checkedOutAt?: Date;

  @Prop({
    default: [],
    type: [
      {
        entityId: { required: true, type: Types.ObjectId },
        entityModel: {
          enum: TASK_LINKED_ENTITY_MODELS,
          required: true,
          type: String,
        },
      },
    ],
  })
  linkedEntities!: Array<{
    entityId: Types.ObjectId;
    entityModel: TaskLinkedEntityModel;
  }>;

  // ─── Content / intent ────────────────────────────────────────────────────────

  @Prop({ maxlength: 4000, required: false, type: String })
  request?: string;

  @Prop({ enum: TASK_OUTPUT_TYPES, required: false, type: String })
  outputType?: TaskOutputType;

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  // ─── Review lifecycle ─────────────────────────────────────────────────────────

  @Prop({ default: 'none', enum: TASK_REVIEW_STATES, type: String })
  reviewState!: TaskReviewState;

  @Prop({ default: false, type: Boolean })
  reviewTriggered!: boolean;

  @Prop({ required: false, type: String })
  resultPreview?: string;

  @Prop({ required: false, type: String })
  failureReason?: string;

  @Prop({ required: false, type: String })
  requestedChangesReason?: string;

  // ─── Routing / execution ──────────────────────────────────────────────────────

  @Prop({ enum: TASK_EXECUTION_PATHS, required: false, type: String })
  executionPathUsed?: TaskExecutionPath;

  @Prop({ required: false, type: String })
  chosenModel?: string;

  @Prop({ required: false, type: String })
  chosenProvider?: string;

  @Prop({ required: false, type: String })
  routingSummary?: string;

  @Prop({ default: [], type: [String] })
  skillsUsed!: string[];

  @Prop({ default: [], ref: 'SkillVariant', type: [Types.ObjectId] })
  skillVariantIds!: Types.ObjectId[];

  // ─── Decomposition ────────────────────────────────────────────────────────────

  @Prop({
    required: false,
    type: {
      isSingleAgent: { required: true, type: Boolean },
      subtasks: {
        default: [],
        type: [
          {
            agentType: { required: true, type: String },
            brief: { required: true, type: String },
            label: { required: true, type: String },
            order: { required: true, type: Number },
          },
        ],
      },
      summary: { required: true, type: String },
    },
  })
  decomposition?: TaskDecomposition;

  // ─── Quality assessment ───────────────────────────────────────────────────────

  @Prop({ required: false, type: Object })
  qualityAssessment?: Record<string, unknown>;

  // ─── Execution progress ───────────────────────────────────────────────────────

  @Prop({
    default: { activeRunCount: 0, message: '', percent: 0, stage: 'queued' },
    type: {
      activeRunCount: { default: 0, type: Number },
      message: { default: '', type: String },
      percent: { default: 0, type: Number },
      stage: { default: 'queued', type: String },
    },
  })
  progress!: TaskProgress;

  // ─── Event stream ─────────────────────────────────────────────────────────────

  @Prop({
    default: [],
    type: [
      {
        createdAt: { required: true, type: Date },
        payload: { required: false, type: Object },
        type: { required: true, type: String },
        userId: { required: false, type: String },
      },
    ],
  })
  eventStream!: TaskEventStreamEntry[];

  // ─── Linked AI records ────────────────────────────────────────────────────────

  @Prop({ default: [], ref: 'AgentRun', type: [Types.ObjectId] })
  linkedRunIds!: Types.ObjectId[];

  @Prop({ default: [], ref: 'Ingredient', type: [Types.ObjectId] })
  linkedOutputIds!: Types.ObjectId[];

  @Prop({ default: [], ref: 'Ingredient', type: [Types.ObjectId] })
  approvedOutputIds!: Types.ObjectId[];

  // No ref added: approvals are not yet a first-class model in this codebase.
  // Add ref: 'Approval' once an Approval collection is introduced.
  @Prop({ default: [], type: [Types.ObjectId] })
  linkedApprovalIds!: Types.ObjectId[];

  @Prop({ ref: 'AgentThread', required: false, type: Types.ObjectId })
  planningThreadId?: Types.ObjectId;

  // ─── Lifecycle timestamps ─────────────────────────────────────────────────────

  @Prop({ required: false, type: Date })
  completedAt?: Date;

  @Prop({ required: false, type: Date })
  dismissedAt?: Date;

  // ─── Soft delete ──────────────────────────────────────────────────────────────

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
