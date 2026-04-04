import { AgentMessageRole } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentMessageDocument = AgentMessageDoc & Document;

@Schema({
  _id: false,
  versionKey: false,
})
export class ToolCall {
  @Prop({ required: true, type: String })
  toolName!: string;

  @Prop({ required: false, type: Object })
  parameters?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  result?: Record<string, unknown>;

  @Prop({ required: false, type: String })
  status?: string;

  @Prop({ required: false, type: Number })
  creditsUsed?: number;

  @Prop({ required: false, type: Number })
  durationMs?: number;

  @Prop({ required: false, type: String })
  error?: string;
}

export const ToolCallSchema = SchemaFactory.createForClass(ToolCall);

@Schema({
  collection: 'agent-messages',
  timestamps: true,
  versionKey: false,
})
export class AgentMessageDoc {
  _id!: string;

  @Prop({
    ref: 'AgentRoom',
    required: true,
    type: Types.ObjectId,
  })
  room!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

  @Prop({
    enum: Object.values(AgentMessageRole),
    required: true,
    type: String,
  })
  role!: AgentMessageRole;

  @Prop({ required: false, type: String })
  content?: string;

  @Prop({ required: false, type: String })
  toolCallId?: string;

  @Prop({ default: [], type: [ToolCallSchema] })
  toolCalls?: ToolCall[];

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentMessageDocSchema =
  SchemaFactory.createForClass(AgentMessageDoc);
