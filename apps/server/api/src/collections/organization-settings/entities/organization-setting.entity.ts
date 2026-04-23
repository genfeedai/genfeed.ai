import { BaseEntity } from '@api/shared/entities/base/base.entity';
export class OrganizationSettingEntity extends BaseEntity {
  declare readonly organization: string;

  declare readonly isWhitelabelEnabled: boolean;
  declare readonly isVoiceControlEnabled: boolean;

  declare readonly isNotificationsDiscordEnabled: boolean;
  declare readonly isNotificationsEmailEnabled: boolean;
  declare readonly isWatermarkEnabled: boolean;
  declare readonly isVerifyScriptEnabled: boolean;
  declare readonly isVerifyIngredientEnabled: boolean;
  declare readonly isVerifyVideoEnabled: boolean;

  declare readonly isGenerateVideosEnabled: boolean;
  declare readonly isGenerateArticlesEnabled: boolean;
  declare readonly isGenerateImagesEnabled: boolean;
  declare readonly isGenerateMusicEnabled: boolean;

  declare readonly isAutoEvaluateEnabled: boolean;

  declare readonly isWebhookEnabled: boolean;
  declare readonly webhookEndpoint: string | undefined;
  declare readonly webhookSecret: string | undefined;

  declare readonly seatsLimit: number;
  declare readonly brandsLimit: number;
  declare readonly timezone: string;

  declare readonly quotaYoutube: number;
  declare readonly quotaTiktok: number;
  declare readonly quotaTwitter: number;
  declare readonly quotaInstagram: number;

  declare readonly enabledModels: string[];

  declare readonly subscriptionTier: string | undefined;

  declare readonly isAdvancedMode: boolean;

  declare readonly isByokEnabled: boolean;
  declare readonly byokOpenrouterApiKey: string | undefined;
  declare readonly defaultAvatarPhotoUrl: string | undefined;
  declare readonly defaultAvatarIngredientId: string | undefined;
  declare readonly defaultVoiceId: string | undefined;
  declare readonly defaultVoiceProvider: string | undefined;
  declare readonly defaultModel: string | undefined;
  declare readonly defaultModelReview: string | undefined;
  declare readonly defaultModelUpdate: string | undefined;
  declare readonly defaultImageModel: string | undefined;
  declare readonly defaultVideoModel: string | undefined;
  declare readonly defaultImageToVideoModel: string | undefined;
  declare readonly defaultMusicModel: string | undefined;
}
