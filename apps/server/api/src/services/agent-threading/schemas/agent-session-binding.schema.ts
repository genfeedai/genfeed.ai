import {
  AGENT_SESSION_BINDING_STATUSES,
  type AgentSessionBindingStatus,
} from '@api/services/agent-threading/types/agent-thread.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentSessionBindingDocument = AgentSessionBinding & Document;

@Schema({
  collection: 'agent-session-bindings',
  timestamps: true,
  versionKey: false,
})
export class AgentSessionBinding {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: true, type: Types.ObjectId })
  thread!: Types.ObjectId;

  @Prop({ required: false, type: String })
  runId?: string;

  @Prop({ required: false, type: String })
  model?: string;

  @Prop({
    default: 'idle',
    enum: AGENT_SESSION_BINDING_STATUSES,
    type: String,
  })
  status!: AgentSessionBindingStatus;

  @Prop({ required: false, type: Object })
  resumeCursor?: Record<string, unknown>;

  @Prop({ required: false, type: String })
  activeCommandId?: string;

  @Prop({ required: false, type: String })
  lastSeenAt?: string;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentSessionBindingSchema =
  SchemaFactory.createForClass(AgentSessionBinding);

AgentSessionBindingSchema.index(
  { organization: 1, thread: 1 },
  { name: 'idx_agent_session_binding_thread', unique: true },
);
