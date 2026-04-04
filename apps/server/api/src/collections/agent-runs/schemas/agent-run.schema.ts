import { AgentExecutionStatus, AgentExecutionTrigger } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentRunDocument = AgentRun & Document;

@Schema({ _id: false })
export class AgentRunToolCall {
  @Prop({ required: true, type: String })
  toolName!: string;

  @Prop({
    enum: ['completed', 'failed'],
    required: true,
    type: String,
  })
  status!: 'completed' | 'failed';

  @Prop({ default: 0, type: Number })
  creditsUsed!: number;

  @Prop({ default: 0, type: Number })
  durationMs!: number;

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({ required: true, type: Date })
  executedAt!: Date;
}

@Schema({
  collection: 'agent-runs',
  timestamps: true,
  versionKey: false,
})
export class AgentRun {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({
    enum: Object.values(AgentExecutionTrigger),
    required: true,
    type: String,
  })
  trigger!: AgentExecutionTrigger;

  @Prop({
    default: AgentExecutionStatus.PENDING,
    enum: Object.values(AgentExecutionStatus),
    type: String,
  })
  status!: AgentExecutionStatus;

  @Prop({ ref: 'AgentStrategy', required: false, type: Types.ObjectId })
  strategy?: Types.ObjectId;

  @Prop({ ref: 'AgentRoom', required: false, type: Types.ObjectId })
  thread?: Types.ObjectId;

  @Prop({ ref: 'AgentRun', required: false, type: Types.ObjectId })
  parentRun?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  objective?: string;

  @Prop({ default: [], type: [AgentRunToolCall] })
  toolCalls!: AgentRunToolCall[];

  @Prop({ required: false, type: String })
  summary?: string;

  @Prop({ default: 0, type: Number })
  creditsUsed!: number;

  @Prop({ required: false, type: Number })
  creditBudget?: number;

  @Prop({ required: false, type: Date })
  startedAt?: Date;

  @Prop({ required: false, type: Date })
  completedAt?: Date;

  @Prop({ required: false, type: Number })
  durationMs?: number;

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({ default: 0, type: Number })
  retryCount!: number;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progress!: number;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentRunToolCallSchema =
  SchemaFactory.createForClass(AgentRunToolCall);
export const AgentRunSchema = SchemaFactory.createForClass(AgentRun);
