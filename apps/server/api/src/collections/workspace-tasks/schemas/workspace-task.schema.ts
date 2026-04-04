import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export const WORKSPACE_TASK_OUTPUT_TYPES = [
  'caption',
  'image',
  'ingredient',
  'video',
] as const;

export const WORKSPACE_TASK_PRIORITIES = ['high', 'normal', 'low'] as const;

export const WORKSPACE_TASK_STATUSES = [
  'triaged',
  'in_progress',
  'needs_review',
  'completed',
  'failed',
  'dismissed',
] as const;

export const WORKSPACE_TASK_REVIEW_STATES = [
  'none',
  'pending_approval',
  'approved',
  'changes_requested',
  'dismissed',
] as const;

export const WORKSPACE_TASK_EXECUTION_PATHS = [
  'agent_orchestrator',
  'caption_generation',
  'image_generation',
  'video_generation',
] as const;

export type WorkspaceTaskDocument = WorkspaceTask & Document;

@Schema({
  collection: 'workspace-tasks',
  timestamps: true,
  versionKey: false,
})
export class WorkspaceTask {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  title!: string;

  @Prop({ required: true, trim: true, type: String })
  request!: string;

  @Prop({
    default: 'ingredient',
    enum: WORKSPACE_TASK_OUTPUT_TYPES,
    type: String,
  })
  outputType!: (typeof WORKSPACE_TASK_OUTPUT_TYPES)[number];

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({
    default: 'normal',
    enum: WORKSPACE_TASK_PRIORITIES,
    type: String,
  })
  priority!: (typeof WORKSPACE_TASK_PRIORITIES)[number];

  @Prop({
    default: 'triaged',
    enum: WORKSPACE_TASK_STATUSES,
    type: String,
  })
  status!: (typeof WORKSPACE_TASK_STATUSES)[number];

  @Prop({
    default: 'none',
    enum: WORKSPACE_TASK_REVIEW_STATES,
    type: String,
  })
  reviewState!: (typeof WORKSPACE_TASK_REVIEW_STATES)[number];

  @Prop({
    default: 'agent_orchestrator',
    enum: WORKSPACE_TASK_EXECUTION_PATHS,
    type: String,
  })
  executionPathUsed!: (typeof WORKSPACE_TASK_EXECUTION_PATHS)[number];

  @Prop({ required: false, type: String })
  chosenModel?: string;

  @Prop({ required: false, type: String })
  chosenProvider?: string;

  @Prop({ required: false, type: String })
  routingSummary?: string;

  @Prop({ default: [], type: [String] })
  skillsUsed!: string[];

  @Prop({ default: [], type: [Types.ObjectId] })
  skillVariantIds!: Types.ObjectId[];

  @Prop({ default: false, type: Boolean })
  reviewTriggered!: boolean;

  @Prop({ required: false, type: Object })
  decomposition?: {
    isSingleAgent: boolean;
    subtasks: Array<{
      agentType: string;
      brief: string;
      label: string;
      order: number;
    }>;
    summary: string;
  };

  @Prop({ ref: 'Issue', required: false, type: Types.ObjectId })
  linkedIssueId?: Types.ObjectId;

  @Prop({ default: [], type: [Types.ObjectId] })
  linkedRunIds!: Types.ObjectId[];

  @Prop({ default: [], type: [Types.ObjectId] })
  linkedOutputIds!: Types.ObjectId[];

  @Prop({ default: [], type: [Types.ObjectId] })
  linkedApprovalIds!: Types.ObjectId[];

  @Prop({ required: false, type: String })
  planningThreadId?: string;

  @Prop({ required: false, type: String })
  resultPreview?: string;

  @Prop({ required: false, type: String })
  failureReason?: string;

  @Prop({ required: false, type: String })
  requestedChangesReason?: string;

  @Prop({ required: false, type: Date })
  completedAt?: Date;

  @Prop({ required: false, type: Date })
  dismissedAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const WorkspaceTaskSchema = SchemaFactory.createForClass(WorkspaceTask);
