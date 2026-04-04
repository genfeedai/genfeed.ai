import {
  AGENT_INPUT_REQUEST_STATUSES,
  AgentInputOptionSchema,
  type AgentInputRequestStatus,
} from '@api/services/agent-threading/types/agent-thread.types';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentInputRequestDocument = AgentInputRequest & Document;

@Schema({
  collection: 'agent-input-requests',
  timestamps: true,
  versionKey: false,
})
export class AgentInputRequest {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: true, type: Types.ObjectId })
  thread!: Types.ObjectId;

  @Prop({ required: true, type: String })
  requestId!: string;

  @Prop({
    default: 'pending',
    enum: AGENT_INPUT_REQUEST_STATUSES,
    type: String,
  })
  status!: AgentInputRequestStatus;

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: true, type: String })
  prompt!: string;

  @Prop({ required: false, type: Boolean })
  allowFreeText?: boolean;

  @Prop({ required: false, type: String })
  recommendedOptionId?: string;

  @Prop({ default: [], type: [AgentInputOptionSchema] })
  options!: Record<string, unknown>[];

  @Prop({ required: false, type: String })
  fieldId?: string;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: false, type: String })
  answer?: string;

  @Prop({ required: false, type: String })
  runId?: string;

  @Prop({ required: false, type: String })
  resolvedAt?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentInputRequestSchema =
  SchemaFactory.createForClass(AgentInputRequest);

AgentInputRequestSchema.index(
  { organization: 1, requestId: 1, thread: 1 },
  { name: 'idx_agent_input_request_unique', unique: true },
);
