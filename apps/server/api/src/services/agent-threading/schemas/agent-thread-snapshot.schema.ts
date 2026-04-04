import {
  AgentPendingApprovalSchema,
  AgentPendingInputRequestSchema,
  AgentThreadActiveRunSchema,
  AgentThreadLastAssistantMessageSchema,
  AgentThreadLatestPlanSchema,
  AgentThreadTimelineEntrySchema,
  AgentThreadUiBlocksStateSchema,
} from '@api/services/agent-threading/types/agent-thread.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentThreadSnapshotDocument = AgentThreadSnapshot & Document;

@Schema({
  collection: 'agent-thread-snapshots',
  timestamps: true,
  versionKey: false,
})
export class AgentThreadSnapshot {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: true, type: Types.ObjectId })
  thread!: Types.ObjectId;

  @Prop({ default: 0, type: Number })
  lastSequence!: number;

  @Prop({ required: false, type: String })
  title?: string;

  @Prop({ required: false, type: String })
  source?: string;

  @Prop({ required: false, type: String })
  threadStatus?: string;

  @Prop({ type: AgentThreadActiveRunSchema })
  activeRun?: Record<string, unknown>;

  @Prop({ default: [], type: [AgentPendingApprovalSchema] })
  pendingApprovals!: Record<string, unknown>[];

  @Prop({ default: [], type: [AgentPendingInputRequestSchema] })
  pendingInputRequests!: Record<string, unknown>[];

  @Prop({ type: AgentThreadLatestPlanSchema })
  latestProposedPlan?: Record<string, unknown>;

  @Prop({ type: AgentThreadUiBlocksStateSchema })
  latestUiBlocks?: Record<string, unknown>;

  @Prop({ type: AgentThreadLastAssistantMessageSchema })
  lastAssistantMessage?: Record<string, unknown>;

  @Prop({ default: [], type: [String] })
  memorySummaryRefs!: string[];

  @Prop({ default: [], type: [AgentThreadTimelineEntrySchema] })
  timeline!: Record<string, unknown>[];

  @Prop({ required: false, type: Object })
  sessionBinding?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  profileSnapshot?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentThreadSnapshotSchema =
  SchemaFactory.createForClass(AgentThreadSnapshot);

AgentThreadSnapshotSchema.index(
  { organization: 1, thread: 1 },
  { name: 'idx_agent_thread_snapshot_thread', unique: true },
);
