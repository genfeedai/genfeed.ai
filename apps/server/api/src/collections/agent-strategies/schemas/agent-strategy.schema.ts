import {
  AGENT_STRATEGY_GOAL_PROFILES,
  AgentStrategyBudgetPolicy,
  type AgentStrategyGoalProfile,
  AgentStrategyOpportunitySources,
  AgentStrategyPublishPolicy,
  AgentStrategyRankingPolicy,
  AgentStrategyReportingPolicy,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type { AgentPolicyQualityTier } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { AGENT_TYPE_VALUES } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentRunStatus,
  AgentType,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AgentStrategyDocument = AgentStrategy & Document;

@Schema({ _id: false })
export class AgentStrategyRunHistory {
  @Prop({ required: true, type: Date })
  startedAt!: Date;

  @Prop({ required: false, type: Date })
  completedAt?: Date;

  @Prop({ enum: Object.values(AgentRunStatus), required: true, type: String })
  status!: AgentRunStatus;

  @Prop({ default: 0, type: Number })
  creditsUsed!: number;

  @Prop({ default: 0, type: Number })
  contentGenerated!: number;

  @Prop({ required: false, type: String })
  threadId?: string;
}

@Schema({
  collection: 'agent-strategies',
  timestamps: true,
  versionKey: false,
})
export class AgentStrategy {
  _id!: string;

  // Multi-tenancy
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ ref: 'AgentGoal', required: false, type: Types.ObjectId })
  goalId?: Types.ObjectId;

  // Agent type — drives tool subset, system prompt template, and credit defaults
  @Prop({
    default: AgentType.GENERAL,
    enum: AGENT_TYPE_VALUES,
    type: String,
  })
  agentType!: AgentType;

  // Autonomy mode — supervised requires manual review before publishing
  @Prop({
    default: AgentAutonomyMode.SUPERVISED,
    enum: Object.values(AgentAutonomyMode),
    type: String,
  })
  autonomyMode!: AgentAutonomyMode;

  // Core config
  @Prop({ default: false, type: Boolean })
  isActive!: boolean;

  @Prop({ default: true, type: Boolean })
  isEnabled!: boolean;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  displayRole?: string;

  @Prop({ required: false, type: String })
  teamGroup?: string;

  @Prop({ required: false, type: String })
  reportsToLabel?: string;

  @Prop({
    default: 'reach_traffic',
    enum: AGENT_STRATEGY_GOAL_PROFILES,
    type: String,
  })
  goalProfile!: AgentStrategyGoalProfile;

  @Prop({ default: [], type: [String] })
  topics!: string[];

  @Prop({
    default: () => ({
      eventTriggersEnabled: true,
      evergreenCadenceEnabled: true,
      trendWatchersEnabled: true,
    }),
    type: AgentStrategyOpportunitySources,
  })
  opportunitySources!: AgentStrategyOpportunitySources;

  @Prop({ required: false, type: String })
  voice?: string;

  @Prop({ required: false, type: String })
  model?: string;

  @Prop({
    default: 'balanced',
    enum: ['budget', 'balanced', 'high_quality'],
    type: String,
  })
  qualityTier!: AgentPolicyQualityTier;

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({ type: ContentMixConfig })
  contentMix?: ContentMixConfig;

  @Prop({ default: 7, type: Number })
  postsPerWeek!: number;

  // Engagement config
  @Prop({ default: false, type: Boolean })
  engagementEnabled!: boolean;

  @Prop({ default: [], type: [String] })
  engagementKeywords!: string[];

  @Prop({ required: false, type: String })
  engagementTone?: string;

  @Prop({ default: 10, type: Number })
  maxEngagementsPerDay!: number;

  // Schedule config
  @Prop({
    default: AgentRunFrequency.DAILY,
    enum: Object.values(AgentRunFrequency),
    type: String,
  })
  runFrequency!: AgentRunFrequency;

  @Prop({ default: 'UTC', type: String })
  timezone!: string;

  @Prop({ default: [], type: [String] })
  preferredPostingTimes!: string[];

  // Budget
  @Prop({ default: 50, type: Number })
  dailyCreditBudget!: number;

  @Prop({ default: 50, type: Number })
  minCreditThreshold!: number;

  @Prop({ default: 200, type: Number })
  weeklyCreditBudget!: number;

  @Prop({
    default: () => ({
      maxRetriesPerOpportunity: 1,
      monthlyCreditBudget: 500,
      perFormatCaps: [],
      perPlatformCaps: [],
      reserveTrendBudget: 125,
    }),
    type: AgentStrategyBudgetPolicy,
  })
  budgetPolicy!: AgentStrategyBudgetPolicy;

  @Prop({ default: 0, type: Number })
  creditsUsedToday!: number;

  @Prop({ default: 0, type: Number })
  dailyCreditsUsed!: number;

  @Prop({ default: 0, type: Number })
  creditsUsedThisWeek!: number;

  @Prop({ default: 0, type: Number })
  monthToDateCreditsUsed!: number;

  @Prop({ default: 0, type: Number })
  expectedSpendToDate!: number;

  @Prop({ default: 125, type: Number })
  reserveTrendBudgetRemaining!: number;

  @Prop({ required: false, type: Date })
  dailyResetAt?: Date;

  @Prop({ required: false, type: Date })
  dailyCreditResetAt?: Date;

  @Prop({ required: false, type: Date })
  weeklyResetAt?: Date;

  @Prop({ required: false, type: Date })
  monthlyResetAt?: Date;

  // Execution state
  @Prop({ required: false, type: Date })
  lastRunAt?: Date;

  @Prop({ required: false, type: Date })
  nextRunAt?: Date;

  @Prop({ default: 0, type: Number })
  consecutiveFailures!: number;

  @Prop({ default: 0.8, max: 1, min: 0, type: Number })
  autoPublishConfidenceThreshold!: number;

  @Prop({
    default: () => ({
      autoPublishEnabled: false,
      brandSafetyMode: 'standard',
      minImageScore: 75,
      minPostScore: 70,
      videoAutopublishEnabled: false,
    }),
    type: AgentStrategyPublishPolicy,
  })
  publishPolicy!: AgentStrategyPublishPolicy;

  @Prop({
    default: () => ({
      dailyDigestEnabled: true,
      reportRecipientUserIds: [],
      weeklySummaryEnabled: true,
    }),
    type: AgentStrategyReportingPolicy,
  })
  reportingPolicy!: AgentStrategyReportingPolicy;

  @Prop({
    default: () => ({
      costEfficiencyWeight: 0.15,
      expectedTrafficWeight: 0.2,
      freshnessWeight: 0.2,
      historicalConfidenceWeight: 0.15,
      relevanceWeight: 0.3,
    }),
    type: AgentStrategyRankingPolicy,
  })
  rankingPolicy!: AgentStrategyRankingPolicy;

  @Prop({ default: false, type: Boolean })
  requiresManualReactivation!: boolean;

  @Prop({ default: [], type: [AgentStrategyRunHistory] })
  runHistory!: AgentStrategyRunHistory[];

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AgentStrategySchema = SchemaFactory.createForClass(AgentStrategy);
