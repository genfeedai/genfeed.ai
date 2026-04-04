import type { AgentAutonomyMode } from '@genfeedai/enums';
import type { IOnboardingJourneyMissionState } from '@genfeedai/constants';
import type { IBaseEntity } from '../index';

export type AgentPolicyQualityTier = 'budget' | 'balanced' | 'high_quality';

export interface IAgentCreditGovernance {
  useOrganizationPool?: boolean;
  brandDailyCreditCap?: number | null;
  agentDailyCreditCap?: number | null;
}

export interface IAgentPolicy {
  qualityTierDefault?: AgentPolicyQualityTier;
  autonomyDefault?: AgentAutonomyMode;
  creditGovernance?: IAgentCreditGovernance;
  thinkingModelOverride?: string | null;
  generationModelOverride?: string | null;
  reviewModelOverride?: string | null;
  allowAdvancedOverrides?: boolean;
}

export interface IOrganizationSetting extends IBaseEntity {
  isWhitelabelEnabled: boolean;
  isVoiceControlEnabled: boolean;

  isNotificationsDiscordEnabled: boolean;
  isNotificationsEmailEnabled: boolean;
  isWatermarkEnabled: boolean;
  isVerifyScriptEnabled: boolean;
  isVerifyIngredientEnabled: boolean;
  isVerifyVideoEnabled: boolean;
  isGenerateVideosEnabled: boolean;
  isGenerateArticlesEnabled: boolean;
  isGenerateImagesEnabled: boolean;
  isGenerateMusicEnabled: boolean;
  isAutoEvaluateEnabled: boolean;
  isDarkroomNsfwVisible: boolean;

  isWebhookEnabled: boolean;
  webhookEndpoint?: string;
  webhookSecret?: string;

  seatsLimit: number;
  brandsLimit: number;
  timezone?: string;

  enabledModels?: string[];
  subscriptionTier?: string;

  isAdvancedMode: boolean;
  agentReplyStyle?: string;

  defaultVoiceId?: string | null;
  defaultVoiceRef?: {
    source: 'catalog' | 'cloned';
    provider?: string;
    internalVoiceId?: string;
    externalVoiceId?: string;
    label?: string;
    preview?: string | null;
  } | null;
  defaultVoiceProvider?: string | null;
  defaultAvatarPhotoUrl?: string | null;
  defaultAvatarIngredientId?: string | null;

  defaultVideoModel?: string | null;
  defaultImageModel?: string | null;
  defaultImageToVideoModel?: string | null;
  defaultMusicModel?: string | null;

  isByokEnabled?: boolean;
  byokOpenrouterApiKey?: string;
  byokKeys?: Record<
    string,
    {
      provider: string;
      apiKey: string;
      apiSecret?: string;
      isEnabled: boolean;
      lastValidatedAt?: Date;
      authMode?: 'api_key' | 'oauth';
      expiresAt?: number;
      oauthAccountId?: string;
      totalRequests?: number;
      lastUsedAt?: Date | null;
    }
  >;
  onboardingJourneyMissions?: IOnboardingJourneyMissionState[];
  onboardingJourneyCompletedAt?: string | Date | null;
  agentPolicy?: IAgentPolicy;
}
