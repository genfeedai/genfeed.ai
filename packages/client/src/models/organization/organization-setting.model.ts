import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { VoiceProvider } from '@genfeedai/contracts';
import type {
  IOnboardingJourneyMissionState,
  IOrganizationSetting,
} from '@genfeedai/contracts/interfaces';

export class OrganizationSetting
  extends BaseEntity
  implements IOrganizationSetting
{
  declare public isWhitelabelEnabled: boolean;
  declare public isVoiceControlEnabled: boolean;

  declare public isNotificationsDiscordEnabled: boolean;
  declare public isNotificationsTelegramEnabled: boolean;
  declare public isNotificationsEmailEnabled: boolean;

  declare public isWatermarkEnabled: boolean;
  declare public isVerifyScriptEnabled: boolean;
  declare public isVerifyIngredientEnabled: boolean;
  declare public isVerifyVideoEnabled: boolean;

  declare public isGenerateVideosEnabled: boolean;
  declare public isGenerateArticlesEnabled: boolean;
  declare public isGenerateImagesEnabled: boolean;
  declare public isGenerateMusicEnabled: boolean;
  declare public isAutoEvaluateEnabled: boolean;
  declare public isFastlaneEnabled: boolean;
  declare public isFleetNsfwVisible: boolean;

  declare public isAdvancedMode: boolean;

  declare public isWebhookEnabled: boolean;
  declare public webhookEndpoint?: string;
  declare public webhookSecret?: string;
  declare public webhookEventTypes?: string[];
  declare public webhookDeliveryStatus?: IOrganizationSetting['webhookDeliveryStatus'];

  declare public seatsLimit: number;
  declare public brandsLimit: number;

  declare public timezone?: string;

  declare public enabledModelIds?: string[];
  declare public defaultAvatarPhotoUrl?: string | null;
  declare public defaultVoiceId?: string | null;
  declare public defaultVoiceProvider?: VoiceProvider | null;
  declare public defaultModel?: string;
  declare public defaultModelReview?: string;
  declare public defaultModelUpdate?: string;
  declare public defaultVoiceRef?: {
    source: 'catalog' | 'cloned';
    provider?: VoiceProvider;
    internalVoiceId?: string;
    externalVoiceId?: string;
    label?: string;
    preview?: string | null;
  } | null;
  declare public isByokEnabled?: boolean;
  declare public byokOpenrouterApiKey?: string;
  declare public onboardingJourneyMissions?: IOnboardingJourneyMissionState[];
  declare public onboardingJourneyCompletedAt?: string | Date | null;

  constructor(data: Partial<IOrganizationSetting> = {}) {
    super(data);
  }
}
