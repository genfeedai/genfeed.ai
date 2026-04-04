import {
  AGENT_THREAD_EVENT_TYPES,
  type AgentThreadEventType,
} from '@api/services/agent-threading/types/agent-thread.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentThreadEventDocument = AgentThreadEvent & Document;

@Schema({
  collection: 'agent-thread-events',
  timestamps: true,
  versionKey: false,
})
export class AgentThreadEvent {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: true, type: Types.ObjectId })
  thread!: Types.ObjectId;

  @Prop({ required: true, type: Number })
  sequence!: number;

  @Prop({ required: true, type: String })
  commandId!: string;

  @Prop({
    enum: AGENT_THREAD_EVENT_TYPES,
    required: true,
    type: String,
  })
  type!: AgentThreadEventType;

  @Prop({ required: false, type: String })
  userId?: string;

  @Prop({ required: false, type: String })
  runId?: string;

  @Prop({ required: false, type: String })
  eventId?: string;

  @Prop({ required: false, type: String })
  occurredAt?: string;

  @Prop({ required: false, type: Object })
  payload?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentThreadEventSchema =
  SchemaFactory.createForClass(AgentThreadEvent);

AgentThreadEventSchema.index(
  { organization: 1, sequence: 1, thread: 1 },
  { name: 'idx_agent_thread_events_sequence', unique: true },
);

AgentThreadEventSchema.index(
  { commandId: 1, organization: 1, thread: 1 },
  { name: 'idx_agent_thread_events_command' },
);

AgentThreadEventSchema.index(
  { organization: 1, runId: 1, sequence: 1 },
  {
    name: 'idx_agent_thread_events_run',
    partialFilterExpression: { runId: { $exists: true } },
  },
);
