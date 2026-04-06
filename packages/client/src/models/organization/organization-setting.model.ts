import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { VoiceProvider } from '@genfeedai/enums';
import type {
  IOnboardingJourneyMissionState,
  IOrganizationSetting,
} from '@genfeedai/interfaces';

export class OrganizationSetting
  extends BaseEntity
  implements IOrganizationSetting
{
  public declare isWhitelabelEnabled: boolean;
  public declare isVoiceControlEnabled: boolean;

  public declare isNotificationsDiscordEnabled: boolean;
  public declare isNotificationsTelegramEnabled: boolean;
  public declare isNotificationsEmailEnabled: boolean;

  public declare isWatermarkEnabled: boolean;
  public declare isVerifyScriptEnabled: boolean;
  public declare isVerifyIngredientEnabled: boolean;
  public declare isVerifyVideoEnabled: boolean;

  public declare isGenerateVideosEnabled: boolean;
  public declare isGenerateArticlesEnabled: boolean;
  public declare isGenerateImagesEnabled: boolean;
  public declare isGenerateMusicEnabled: boolean;
  public declare isAutoEvaluateEnabled: boolean;
  public declare isDarkroomNsfwVisible: boolean;

  public declare isAdvancedMode: boolean;

  public declare isWebhookEnabled: boolean;
  public declare webhookEndpoint?: string;
  public declare webhookSecret?: string;

  public declare seatsLimit: number;
  public declare brandsLimit: number;

  public declare timezone?: string;

  public declare enabledModels?: string[];
  public declare defaultAvatarPhotoUrl?: string | null;
  public declare defaultVoiceId?: string | null;
  public declare defaultVoiceProvider?: VoiceProvider | null;
  public declare defaultModel?: string;
  public declare defaultModelReview?: string;
  public declare defaultModelUpdate?: string;
  public declare defaultVoiceRef?: {
    source: 'catalog' | 'cloned';
    provider?: VoiceProvider;
    internalVoiceId?: string;
    externalVoiceId?: string;
    label?: string;
    preview?: string | null;
  } | null;
  public declare isByokEnabled?: boolean;
  public declare byokOpenrouterApiKey?: string;
  public declare onboardingJourneyMissions?: IOnboardingJourneyMissionState[];
  public declare onboardingJourneyCompletedAt?: string | Date | null;

  constructor(data: Partial<IOrganizationSetting> = {}) {
    super(data);
  }
}
