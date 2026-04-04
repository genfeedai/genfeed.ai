import {
  AGENT_STRATEGY_GOAL_PROFILES,
  AgentStrategyBudgetPolicy,
  type AgentStrategyGoalProfile,
  AgentStrategyOpportunitySources,
  AgentStrategyPublishPolicy,
  AgentStrategyRankingPolicy,
  AgentStrategyReportingPolicy,
} from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import {
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
import {
  AgentAutonomyMode,
  AgentReplyStyle,
  ByokBillingStatus,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type Document, Types } from 'mongoose';

export type OrganizationSettingDocument = OrganizationSetting & Document;
export const AGENT_POLICY_QUALITY_TIERS = [
  'budget',
  'balanced',
  'high_quality',
] as const;

export type AgentPolicyQualityTier =
  (typeof AGENT_POLICY_QUALITY_TIERS)[number];

const OnboardingJourneyMissionSchema = new mongoose.Schema(
  {
    completedAt: { default: null, type: Date },
    id: {
      enum: ONBOARDING_JOURNEY_MISSIONS.map((mission) => mission.id),
      required: true,
      type: String,
    },
    isCompleted: { default: false, type: Boolean },
    rewardClaimed: { default: false, type: Boolean },
    rewardCredits: { required: true, type: Number },
  },
  { _id: false },
);

@Schema({ _id: false })
export class AgentCreditGovernance {
  @Prop({ default: true, type: Boolean })
  useOrganizationPool!: boolean;

  @Prop({ default: null, type: Number })
  brandDailyCreditCap?: number | null;

  @Prop({ default: null, type: Number })
  agentDailyCreditCap?: number | null;
}

@Schema({ _id: false })
export class AgentPolicy {
  @Prop({
    default: 'balanced',
    enum: AGENT_POLICY_QUALITY_TIERS,
    type: String,
  })
  qualityTierDefault!: AgentPolicyQualityTier;

  @Prop({
    default: AgentAutonomyMode.SUPERVISED,
    enum: Object.values(AgentAutonomyMode),
    type: String,
  })
  autonomyDefault!: AgentAutonomyMode;

  @Prop({
    default: 'reach_traffic',
    enum: AGENT_STRATEGY_GOAL_PROFILES,
    type: String,
  })
  goalProfileDefault!: AgentStrategyGoalProfile;

  @Prop({
    default: () => ({ useOrganizationPool: true }),
    type: AgentCreditGovernance,
  })
  creditGovernance!: AgentCreditGovernance;

  @Prop({
    default: () => ({
      eventTriggersEnabled: true,
      evergreenCadenceEnabled: true,
      trendWatchersEnabled: true,
    }),
    type: AgentStrategyOpportunitySources,
  })
  opportunitySourcesDefaults!: AgentStrategyOpportunitySources;

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
  budgetPolicyDefaults!: AgentStrategyBudgetPolicy;

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
  publishPolicyDefaults!: AgentStrategyPublishPolicy;

  @Prop({
    default: () => ({
      dailyDigestEnabled: true,
      reportRecipientUserIds: [],
      weeklySummaryEnabled: true,
    }),
    type: AgentStrategyReportingPolicy,
  })
  reportingPolicyDefaults!: AgentStrategyReportingPolicy;

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
  rankingPolicyDefaults!: AgentStrategyRankingPolicy;

  @Prop({ default: null, type: String })
  thinkingModelOverride?: string | null;

  @Prop({ default: null, type: String })
  generationModelOverride?: string | null;

  @Prop({ default: null, type: String })
  reviewModelOverride?: string | null;

  @Prop({ default: false, type: Boolean })
  allowAdvancedOverrides!: boolean;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'organization-settings',
  timestamps: true,
  versionKey: false,
})
export class OrganizationSetting {
  _id!: string;

  @Prop({ default: true, type: Boolean })
  isFirstLogin?: boolean;

  @Prop({
    ref: 'Organization',
    type: Types.ObjectId,
    unique: true,
  })
  organization!: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isWhitelabelEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isVoiceControlEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isNotificationsDiscordEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isNotificationsEmailEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isDarkroomNsfwVisible!: boolean;

  @Prop({ default: true, type: Boolean })
  isWatermarkEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isVerifyScriptEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isVerifyIngredientEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isVerifyVideoEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isGenerateVideosEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isGenerateArticlesEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isGenerateImagesEnabled!: boolean;

  @Prop({ default: true, type: Boolean })
  isGenerateMusicEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isAutoEvaluateEnabled!: boolean;

  @Prop({ default: 3, type: Number })
  seatsLimit!: number;

  @Prop({ default: 5, type: Number })
  brandsLimit!: number;

  @Prop({ default: 'UTC', type: String })
  timezone!: string;

  @Prop({ default: false, type: Boolean })
  isWebhookEnabled!: boolean;

  @Prop({ type: String })
  webhookEndpoint?: string;

  @Prop({ type: String })
  webhookSecret?: string;

  @Prop({ default: 5, type: Number })
  quotaYoutube!: number;

  @Prop({ default: 1, type: Number })
  quotaTiktok!: number;

  @Prop({ default: 5, type: Number })
  quotaTwitter!: number;

  @Prop({ default: 5, type: Number })
  quotaInstagram!: number;

  @Prop({ default: [], ref: 'Model', type: [Types.ObjectId] })
  enabledModels!: Types.ObjectId[];

  @Prop({ type: String })
  subscriptionTier?: string;

  @Prop({ default: false, type: Boolean })
  isByokEnabled!: boolean;

  @Prop({ default: false, type: Boolean })
  hasEverHadCredits!: boolean;

  @Prop({
    default: () =>
      ONBOARDING_JOURNEY_MISSIONS.map((mission) => ({
        completedAt: null,
        id: mission.id,
        isCompleted: false,
        rewardClaimed: false,
        rewardCredits: mission.rewardCredits,
      })),
    type: [OnboardingJourneyMissionSchema],
  })
  onboardingJourneyMissions!: Array<{
    id: OnboardingJourneyMissionId;
    isCompleted: boolean;
    rewardClaimed: boolean;
    rewardCredits: number;
    completedAt?: Date | null;
  }>;

  @Prop({ default: null, type: Date })
  onboardingJourneyCompletedAt?: Date | null;

  @Prop({ default: false, type: Boolean })
  isAdvancedMode!: boolean;

  @Prop({
    default: AgentReplyStyle.CONCISE,
    enum: Object.values(AgentReplyStyle),
    type: String,
  })
  agentReplyStyle!: AgentReplyStyle;

  @Prop({
    get: (value: string) => (value ? EncryptionUtil.decrypt(value) : value),
    required: false,
    set: (value: string) => (value ? EncryptionUtil.encrypt(value) : value),
    type: String,
  })
  byokOpenrouterApiKey?: string;

  @Prop({ default: 0, type: Number })
  byokBillingRollover!: number;

  @Prop({
    default: ByokBillingStatus.ACTIVE,
    enum: Object.values(ByokBillingStatus),
    type: String,
  })
  byokBillingStatus!: ByokBillingStatus;

  @Prop({ default: null, type: Number })
  byokFreeThresholdOverride!: number | null;

  @Prop({ type: String })
  defaultAvatarPhotoUrl?: string;

  @Prop({ ref: 'Ingredient', type: Types.ObjectId })
  defaultAvatarIngredientId?: Types.ObjectId;

  @Prop({ ref: 'Ingredient', type: Types.ObjectId })
  defaultVoiceId?: Types.ObjectId;

  @Prop({ required: false, type: DefaultVoiceRef })
  defaultVoiceRef?: DefaultVoiceRef;

  @Prop({ type: String })
  defaultVoiceProvider?: string;

  @Prop({ required: false, type: String })
  defaultModel?: string;

  @Prop({ required: false, type: String })
  defaultModelReview?: string;

  @Prop({ required: false, type: String })
  defaultModelUpdate?: string;

  @Prop({ required: false, type: String })
  defaultImageModel?: string;

  @Prop({ required: false, type: String })
  defaultVideoModel?: string;

  @Prop({ required: false, type: String })
  defaultImageToVideoModel?: string;

  @Prop({ required: false, type: String })
  defaultMusicModel?: string;

  @Prop({
    default: () => ({
      allowAdvancedOverrides: false,
      autonomyDefault: AgentAutonomyMode.SUPERVISED,
      creditGovernance: { useOrganizationPool: true },
      qualityTierDefault: 'balanced',
    }),
    type: AgentPolicy,
  })
  agentPolicy!: AgentPolicy;

  @Prop({
    default: new Map(),
    of: new mongoose.Schema(
      {
        apiKey: { required: true, type: String },
        apiSecret: { required: false, type: String },
        authMode: {
          enum: ['api_key', 'oauth'],
          required: false,
          type: String,
        },
        expiresAt: { required: false, type: Number },
        isEnabled: { default: true, type: Boolean },
        lastUsedAt: { default: null, required: false, type: Date },
        lastValidatedAt: { required: false, type: Date },
        oauthAccountId: { required: false, type: String },
        provider: { required: true, type: String },
        totalRequests: { default: 0, required: false, type: Number },
      },
      { _id: false },
    ),
    type: Map,
  })
  byokKeys!: Map<
    string,
    {
      provider: string;
      apiKey: string;
      apiSecret?: string;
      authMode?: 'api_key' | 'oauth';
      expiresAt?: number;
      isEnabled: boolean;
      lastValidatedAt?: Date;
      oauthAccountId?: string;
      totalRequests?: number;
      lastUsedAt?: Date | null;
    }
  >;
}

export const OrganizationSettingSchema =
  SchemaFactory.createForClass(OrganizationSetting);
