import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentProfileSnapshotDocument = AgentProfileSnapshot & Document;

@Schema({
  collection: 'agent-profile-snapshots',
  timestamps: true,
  versionKey: false,
})
export class AgentProfileSnapshot {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: true, type: Types.ObjectId })
  thread!: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId })
  strategy?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId })
  campaign?: Types.ObjectId;

  @Prop({ required: false, type: String })
  agentType?: string;

  @Prop({ default: [], type: [String] })
  enabledTools!: string[];

  @Prop({ default: [], type: [String] })
  promptFragments!: string[];

  @Prop({ required: false, type: Object })
  memoryPolicy?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  outputRules?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  hooks?: Record<string, unknown>;

  @Prop({ required: false, type: String })
  routeKey?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentProfileSnapshotSchema =
  SchemaFactory.createForClass(AgentProfileSnapshot);

AgentProfileSnapshotSchema.index(
  { organization: 1, thread: 1 },
  { name: 'idx_agent_profile_snapshot_thread', unique: true },
);
