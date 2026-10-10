import type { AgentAutonomyMode } from '../..';
import type { AppLocale } from '../../constants';
import type { OrganizationModuleOverrides } from '../../constants/organization-modules.constant';
import type { IFleetEvaluationPolicy } from '../analytics/fleet-evaluation-policy.interface';
import type { IBaseEntity } from '../index';
import type {
  HeyGenAvatarRef,
  HeyGenConnectionRef,
} from '../integrations/heygen.interface';
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
  attempt?: number;
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
  isNotificationsTelegramEnabled: boolean;
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
  isFleetNsfwVisible: boolean;

  isWebhookEnabled: boolean;
  webhookEndpoint?: string;
  webhookSecret?: string;
  webhookEventTypes?: string[];
  webhookDeliveryStatus?: IWebhookDeliveryStatus | null;

  seatsLimit: number;
  brandsLimit: number;
  timezone?: string;
  defaultLocale?: AppLocale;

  // Daily cap on published posts per connected account, per UTC day.
  // 0 = no cap. Enforced by the API QuotaService.
  quotaYoutube?: number;
  quotaTiktok?: number;
  quotaTwitter?: number;
  quotaInstagram?: number;

  enabledModelIds?: string[];
  subscriptionTier?: string;

  agentReplyStyle?: string;

  defaultVoiceId?: string | null;
  defaultVoiceRef?: {
    source: 'catalog' | 'cloned';
    provider?: string;
    internalVoiceId?: string;
    externalVoiceId?: string;
    label?: string;
    preview?: string | null;
    ownership?: 'private' | 'public';
    connection?: HeyGenConnectionRef;
  } | null;
  defaultVoiceProvider?: string | null;
  defaultAvatarRef?: HeyGenAvatarRef | null;
  defaultAvatarPhotoUrl?: string | null;
  defaultAvatarIngredientId?: string | null;

  defaultModel?: string | null;
  defaultModelReview?: string | null;
  defaultModelUpdate?: string | null;
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
  moduleOverrides?: OrganizationModuleOverrides;
  /** Founder release preview; only platform admins change it (#5502). */
  isReleasePreviewEnabled?: boolean;
  /** Read-only server runtime hint for presentation; admission always rechecks. */
  readonly hasOrganizationBilling?: boolean;
  /** Read-only fresh paid eligibility; null means the grant could not be verified. */
  readonly hasPaidModuleSubscription?: boolean | null;
  fleetEvaluationPolicy?: IFleetEvaluationPolicy;

  // First-asset unlock gate: durable org signal, flips true on the org's first
  // completed generation (Ingredient -> GENERATED).
  hasGeneratedFirstAsset?: boolean;
}
