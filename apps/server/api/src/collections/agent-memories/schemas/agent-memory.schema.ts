import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentMemoryDocument = AgentMemory & Document;

export const AGENT_MEMORY_KINDS = [
  'preference',
  'positive_example',
  'negative_example',
  'winner',
  'reference',
  'instruction',
  'pattern',
] as const;

export const AGENT_MEMORY_SCOPES = ['user', 'brand', 'campaign'] as const;

export const AGENT_MEMORY_CONTENT_TYPES = [
  'newsletter',
  'tweet',
  'thread',
  'article',
  'post',
  'generic',
] as const;

export type AgentMemoryKind = (typeof AGENT_MEMORY_KINDS)[number];
export type AgentMemoryScope = (typeof AGENT_MEMORY_SCOPES)[number];
export type AgentMemoryContentType =
  (typeof AGENT_MEMORY_CONTENT_TYPES)[number];

@Schema({
  collection: 'agent-memories',
  timestamps: true,
  versionKey: false,
})
export class AgentMemory {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({
    default: 'instruction',
    enum: AGENT_MEMORY_KINDS,
    type: String,
  })
  kind!: AgentMemoryKind;

  @Prop({
    default: 'user',
    enum: AGENT_MEMORY_SCOPES,
    type: String,
  })
  scope!: AgentMemoryScope;

  @Prop({
    default: 'generic',
    enum: AGENT_MEMORY_CONTENT_TYPES,
    type: String,
  })
  contentType!: AgentMemoryContentType;

  @Prop({ required: false, type: String })
  sourceMessageId?: string;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ ref: 'AgentCampaign', required: false, type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  platform?: string;

  @Prop({ required: false, type: String })
  sourceType?: string;

  @Prop({ required: false, type: String })
  sourceUrl?: string;

  @Prop({ required: false, type: String })
  sourceContentId?: string;

  @Prop({ default: 0.5, max: 1, min: 0, type: Number })
  importance!: number;

  @Prop({ default: 0.5, max: 1, min: 0, type: Number })
  confidence!: number;

  @Prop({ type: Object })
  performanceSnapshot?: Record<string, unknown>;

  @Prop({ default: [], required: false, type: [String] })
  tags?: string[];

  @Prop({ required: false, type: String })
  summary?: string;
}

export const AgentMemorySchema = SchemaFactory.createForClass(AgentMemory);
