import { Prop, Schema } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const AGENT_STRATEGY_GOAL_PROFILES = ['reach_traffic'] as const;
export type AgentStrategyGoalProfile =
  (typeof AGENT_STRATEGY_GOAL_PROFILES)[number];

export const AGENT_STRATEGY_BRAND_SAFETY_MODES = [
  'standard',
  'strict',
] as const;
export type AgentStrategyBrandSafetyMode =
  (typeof AGENT_STRATEGY_BRAND_SAFETY_MODES)[number];

export const AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES = [
  'trend',
  'event',
  'evergreen',
] as const;
export type AgentStrategyOpportunitySourceType =
  (typeof AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES)[number];

export const AGENT_STRATEGY_OPPORTUNITY_STATUSES = [
  'queued',
  'generating',
  'revising',
  'approved',
  'published',
  'held',
  'discarded',
  'expired',
] as const;
export type AgentStrategyOpportunityStatus =
  (typeof AGENT_STRATEGY_OPPORTUNITY_STATUSES)[number];

export const AGENT_STRATEGY_REPORT_TYPES = ['daily', 'weekly'] as const;
export type AgentStrategyReportType =
  (typeof AGENT_STRATEGY_REPORT_TYPES)[number];

@Schema({ _id: false })
export class AgentStrategyOpportunitySources {
  @Prop({ default: true, type: Boolean })
  trendWatchersEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  eventTriggersEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  evergreenCadenceEnabled!: boolean;
}

@Schema({ _id: false })
export class AgentStrategyBudgetCap {
  @Prop({ required: true, type: String })
  key!: string;

  @Prop({ default: 0, type: Number })
  creditBudget!: number;
}

@Schema({ _id: false })
export class AgentStrategyBudgetPolicy {
  @Prop({ default: 500, type: Number })
  monthlyCreditBudget!: number;

  @Prop({ default: 125, type: Number })
  reserveTrendBudget!: number;

  @Prop({ default: [], type: [AgentStrategyBudgetCap] })
  perPlatformCaps!: AgentStrategyBudgetCap[];

  @Prop({ default: [], type: [AgentStrategyBudgetCap] })
  perFormatCaps!: AgentStrategyBudgetCap[];

  @Prop({ default: 1, type: Number })
  maxRetriesPerOpportunity!: number;
}

@Schema({ _id: false })
export class AgentStrategyPublishPolicy {
  @Prop({ default: false, type: Boolean })
  autoPublishEnabled!: boolean;

  @Prop({ default: 70, max: 100, min: 0, type: Number })
  minPostScore!: number;

  @Prop({ default: 75, max: 100, min: 0, type: Number })
  minImageScore!: number;

  @Prop({ default: false, type: Boolean })
  videoAutopublishEnabled!: boolean;

  @Prop({
    default: 'standard',
    enum: AGENT_STRATEGY_BRAND_SAFETY_MODES,
    type: String,
  })
  brandSafetyMode!: AgentStrategyBrandSafetyMode;
}

@Schema({ _id: false })
export class AgentStrategyReportingPolicy {
  @Prop({ default: true, type: Boolean })
  dailyDigestEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  weeklySummaryEnabled!: boolean;

  @Prop({ default: [], ref: 'User', type: [Types.ObjectId] })
  reportRecipientUserIds!: Types.ObjectId[];
}

@Schema({ _id: false })
export class AgentStrategyRankingPolicy {
  @Prop({ default: 0.3, type: Number })
  relevanceWeight!: number;

  @Prop({ default: 0.2, type: Number })
  freshnessWeight!: number;

  @Prop({ default: 0.2, type: Number })
  expectedTrafficWeight!: number;

  @Prop({ default: 0.15, type: Number })
  historicalConfidenceWeight!: number;

  @Prop({ default: 0.15, type: Number })
  costEfficiencyWeight!: number;
}
