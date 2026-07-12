import type { AgentAutonomyMode } from '@genfeedai/enums';
import type { IBaseEntity } from '../index';
import type { IOnboardingJourneyMissionState } from '../onboarding/onboarding-journey.interface';

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

export type WebhookDeliveryStatusValue =
  | 'queued'
  | 'delivered'
  | 'rejected'
  | 'failed';

export interface IWebhookDeliveryStatus {
  deliveryId: string;
  event: string;
  status: WebhookDeliveryStatusValue;
  queuedAt?: string | Date | null;
  attemptedAt?: string | Date | null;
  completedAt?: string | Date | null;
  statusCode?: number | null;
  error?: string | null;
  isTest?: boolean;
}

export interface IOrganizationSetting extends IBaseEntity {
  isFirstLogin?: boolean;
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
  isFastlaneEnabled: boolean;
  isDarkroomNsfwVisible: boolean;

  isWebhookEnabled: boolean;
  webhookEndpoint?: string;
  webhookSecret?: string;
  webhookEventTypes?: string[];
  webhookDeliveryStatus?: IWebhookDeliveryStatus | null;

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

  // First-asset unlock gate: durable org signal, flips true on the org's first
  // completed generation (Ingredient -> GENERATED).
  hasGeneratedFirstAsset?: boolean;
}
