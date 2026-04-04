import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentCampaignDocument = AgentCampaign & Document;

@Schema({ _id: false })
export class ContentQuotaConfig {
  @Prop({ required: false, type: Number })
  posts?: number;

  @Prop({ required: false, type: Number })
  images?: number;

  @Prop({ required: false, type: Number })
  videos?: number;
}

@Schema({
  collection: 'agent-campaigns',
  timestamps: true,
  versionKey: false,
})
export class AgentCampaign {
  _id!: string;

  // Multi-tenancy
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  brief?: string;

  // Array of AgentStrategy IDs in this campaign
  @Prop({ default: [], ref: 'AgentStrategy', type: [Types.ObjectId] })
  agents!: Types.ObjectId[];

  @Prop({ ref: 'AgentStrategy', required: false, type: Types.ObjectId })
  campaignLeadStrategyId?: Types.ObjectId;

  @Prop({ required: true, type: Date })
  startDate!: Date;

  @Prop({ required: false, type: Date })
  endDate?: Date;

  @Prop({
    default: 'draft',
    enum: ['draft', 'active', 'paused', 'completed'],
    type: String,
  })
  status!: 'draft' | 'active' | 'paused' | 'completed';

  @Prop({ required: false, type: ContentQuotaConfig })
  contentQuota?: ContentQuotaConfig;

  @Prop({ default: 0, type: Number })
  creditsAllocated!: number;

  @Prop({ default: 0, type: Number })
  creditsUsed!: number;

  @Prop({ default: true, type: Boolean })
  orchestrationEnabled!: boolean;

  @Prop({ default: 24, min: 1, type: Number })
  orchestrationIntervalHours!: number;

  @Prop({ required: false, type: Date })
  lastOrchestratedAt?: Date;

  @Prop({ required: false, type: Date })
  nextOrchestratedAt?: Date;

  @Prop({ required: false, type: String })
  lastOrchestrationSummary?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentCampaignSchema = SchemaFactory.createForClass(AgentCampaign);
