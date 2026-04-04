import type { AgentDashboardOperation } from '@genfeedai/interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const AGENT_THREAD_EVENT_TYPES = [
  'thread.turn_requested',
  'thread.turn_started',
  'assistant.delta',
  'assistant.finalized',
  'tool.started',
  'tool.progress',
  'tool.completed',
  'input.requested',
  'input.resolved',
  'plan.upserted',
  'ui.blocks_updated',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'memory.flushed',
  'work.started',
  'work.updated',
  'work.completed',
  'error.raised',
] as const;

export type AgentThreadEventType = (typeof AGENT_THREAD_EVENT_TYPES)[number];

export const AGENT_THREAD_TIMELINE_ENTRY_KINDS = [
  'assistant',
  'input',
  'message',
  'plan',
  'tool',
  'work',
  'system',
  'error',
] as const;

export type AgentThreadTimelineEntryKind =
  (typeof AGENT_THREAD_TIMELINE_ENTRY_KINDS)[number];

export const AGENT_SESSION_BINDING_STATUSES = [
  'idle',
  'running',
  'waiting_input',
  'completed',
  'failed',
  'cancelled',
] as const;

export type AgentSessionBindingStatus =
  (typeof AGENT_SESSION_BINDING_STATUSES)[number];

export const AGENT_INPUT_REQUEST_STATUSES = ['pending', 'resolved'] as const;

export type AgentInputRequestStatus =
  (typeof AGENT_INPUT_REQUEST_STATUSES)[number];

@Schema({ _id: false })
export class AgentPendingApproval {
  @Prop({ required: true, type: String })
  requestId!: string;

  @Prop({ required: true, type: String })
  requestKind!: string;

  @Prop({ required: false, type: String })
  detail?: string;

  @Prop({ required: true, type: String })
  createdAt!: string;
}

export const AgentPendingApprovalSchema =
  SchemaFactory.createForClass(AgentPendingApproval);

@Schema({ _id: false })
export class AgentInputOption {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  description?: string;
}

export const AgentInputOptionSchema =
  SchemaFactory.createForClass(AgentInputOption);

@Schema({ _id: false })
export class AgentPendingInputRequest {
  @Prop({ required: true, type: String })
  requestId!: string;

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: true, type: String })
  prompt!: string;

  @Prop({ required: false, type: Boolean })
  allowFreeText?: boolean;

  @Prop({ required: false, type: String })
  recommendedOptionId?: string;

  @Prop({ default: [], type: [AgentInputOptionSchema] })
  options!: AgentInputOption[];

  @Prop({ required: false, type: String })
  fieldId?: string;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true, type: String })
  createdAt!: string;
}

export const AgentPendingInputRequestSchema = SchemaFactory.createForClass(
  AgentPendingInputRequest,
);

@Schema({ _id: false })
export class AgentThreadActiveRun {
  @Prop({ required: true, type: String })
  runId!: string;

  @Prop({ required: false, type: String })
  model?: string;

  @Prop({ required: true, type: String })
  status!: string;

  @Prop({ required: false, type: String })
  startedAt?: string;

  @Prop({ required: false, type: String })
  completedAt?: string;
}

export const AgentThreadActiveRunSchema =
  SchemaFactory.createForClass(AgentThreadActiveRun);

@Schema({ _id: false })
export class AgentThreadLatestPlan {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: false, type: String })
  explanation?: string;

  @Prop({ required: true, type: String })
  createdAt!: string;

  @Prop({ required: true, type: String })
  updatedAt!: string;

  @Prop({ required: false, type: String })
  content?: string;

  @Prop({ required: false, type: Object })
  steps?: Record<string, unknown>[];

  @Prop({ required: false, type: String })
  status?: string;

  @Prop({ required: false, type: Boolean })
  awaitingApproval?: boolean;

  @Prop({ required: false, type: String })
  lastReviewAction?: string;

  @Prop({ required: false, type: String })
  revisionNote?: string;

  @Prop({ required: false, type: String })
  approvedAt?: string;
}

export const AgentThreadLatestPlanSchema = SchemaFactory.createForClass(
  AgentThreadLatestPlan,
);

@Schema({ _id: false })
export class AgentThreadUiBlocksState {
  @Prop({ required: true, type: String })
  operation!: AgentDashboardOperation | string;

  @Prop({ required: false, type: [Object] })
  blocks?: Record<string, unknown>[];

  @Prop({ required: false, type: [String] })
  blockIds?: string[];

  @Prop({ required: false, type: String })
  updatedAt?: string;
}

export const AgentThreadUiBlocksStateSchema = SchemaFactory.createForClass(
  AgentThreadUiBlocksState,
);

@Schema({ _id: false })
export class AgentThreadLastAssistantMessage {
  @Prop({ required: true, type: String })
  messageId!: string;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true, type: String })
  createdAt!: string;
}

export const AgentThreadLastAssistantMessageSchema =
  SchemaFactory.createForClass(AgentThreadLastAssistantMessage);

@Schema({ _id: false })
export class AgentThreadTimelineEntry {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({
    enum: AGENT_THREAD_TIMELINE_ENTRY_KINDS,
    required: true,
    type: String,
  })
  kind!: AgentThreadTimelineEntryKind;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  detail?: string;

  @Prop({ required: false, type: String })
  status?: string;

  @Prop({ required: false, type: String })
  runId?: string;

  @Prop({ required: false, type: String })
  toolName?: string;

  @Prop({ required: false, type: String })
  requestId?: string;

  @Prop({ required: false, type: String })
  role?: string;

  @Prop({ required: false, type: Object })
  payload?: Record<string, unknown>;

  @Prop({ required: true, type: String })
  createdAt!: string;

  @Prop({ required: true, type: Number })
  sequence!: number;
}

export const AgentThreadTimelineEntrySchema = SchemaFactory.createForClass(
  AgentThreadTimelineEntry,
);
