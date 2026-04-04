import {
  AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES,
  AGENT_STRATEGY_OPPORTUNITY_STATUSES,
  type AgentStrategyOpportunitySourceType,
  type AgentStrategyOpportunityStatus,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentStrategyOpportunityDocument = AgentStrategyOpportunity &
  Document & {
    createdAt?: Date;
    updatedAt?: Date;
  };

@Schema({
  collection: 'agent-strategy-opportunities',
  timestamps: true,
  versionKey: false,
})
export class AgentStrategyOpportunity {
  _id!: string;

  @Prop({ ref: 'AgentStrategy', required: true, type: Types.ObjectId })
  strategy!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({
    enum: AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES,
    required: true,
    type: String,
  })
  sourceType!: AgentStrategyOpportunitySourceType;

  @Prop({ required: false, type: String })
  sourceRef?: string;

  @Prop({ required: true, type: String })
  topic!: string;

  @Prop({ default: [], type: [String] })
  platformCandidates!: string[];

  @Prop({ default: [], type: [String] })
  formatCandidates!: string[];

  @Prop({ default: 0, type: Number })
  relevanceScore!: number;

  @Prop({ default: 0, type: Number })
  expectedTrafficScore!: number;

  @Prop({ default: 0, type: Number })
  estimatedCreditCost!: number;

  @Prop({ default: 0, type: Number })
  priorityScore!: number;

  @Prop({
    default: 'queued',
    enum: AGENT_STRATEGY_OPPORTUNITY_STATUSES,
    type: String,
  })
  status!: AgentStrategyOpportunityStatus;

  @Prop({ required: false, type: Date })
  expiresAt?: Date;

  @Prop({ required: false, type: String })
  decisionReason?: string;

  @Prop({ default: 0, type: Number })
  retryCount!: number;

  @Prop({ default: {}, type: Object })
  metadata!: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentStrategyOpportunitySchema = SchemaFactory.createForClass(
  AgentStrategyOpportunity,
);
