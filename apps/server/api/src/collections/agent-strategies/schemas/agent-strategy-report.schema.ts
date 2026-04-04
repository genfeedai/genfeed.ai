import {
  AGENT_STRATEGY_REPORT_TYPES,
  type AgentStrategyReportType,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentStrategyReportDocument = AgentStrategyReport & Document;

@Schema({ _id: false })
export class AgentStrategyPlatformFormatPair {
  @Prop({ required: true, type: String })
  platform!: string;

  @Prop({ required: true, type: String })
  format!: string;

  @Prop({ default: 0, type: Number })
  score!: number;
}

@Schema({
  collection: 'agent-strategy-reports',
  timestamps: true,
  versionKey: false,
})
export class AgentStrategyReport {
  _id!: string;

  @Prop({ ref: 'AgentStrategy', required: true, type: Types.ObjectId })
  strategy!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({
    enum: AGENT_STRATEGY_REPORT_TYPES,
    required: true,
    type: String,
  })
  reportType!: AgentStrategyReportType;

  @Prop({ required: true, type: Date })
  periodStart!: Date;

  @Prop({ required: true, type: Date })
  periodEnd!: Date;

  @Prop({ default: 0, type: Number })
  generatedCount!: number;

  @Prop({ default: 0, type: Number })
  publishedCount!: number;

  @Prop({ default: 0, type: Number })
  impressions!: number;

  @Prop({ default: 0, type: Number })
  clicks!: number;

  @Prop({ default: 0, type: Number })
  visits!: number;

  @Prop({ default: 0, type: Number })
  ctr!: number;

  @Prop({ default: 0, type: Number })
  creditsSpent!: number;

  @Prop({ default: 0, type: Number })
  costPerVisit!: number;

  @Prop({ default: [], type: [String] })
  topHooks!: string[];

  @Prop({ default: [], type: [String] })
  topTopics!: string[];

  @Prop({ default: [], type: [String] })
  bestPostingWindows!: string[];

  @Prop({ default: [], type: [AgentStrategyPlatformFormatPair] })
  bestPlatformFormatPairs!: AgentStrategyPlatformFormatPair[];

  @Prop({ default: [], type: [String] })
  allocationChanges!: string[];

  @Prop({ default: {}, type: Object })
  metadata!: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentStrategyReportSchema =
  SchemaFactory.createForClass(AgentStrategyReport);
