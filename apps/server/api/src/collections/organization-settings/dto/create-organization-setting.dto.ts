import {
  AGENT_POLICY_QUALITY_TIERS,
  type AgentPolicyQualityTier,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { DefaultVoiceRefDto } from '@api/shared/default-voice-ref/default-voice-ref.dto';
import { AgentAutonomyMode, AgentReplyStyle } from '@genfeedai/enums';
import {
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class AgentCreditGovernanceDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether autonomous agents spend from the pooled org balance',
    required: false,
  })
  readonly useOrganizationPool?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description:
      'Optional per-brand daily cap enforced against the pooled org balance',
    required: false,
  })
  readonly brandDailyCreditCap?: number | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description:
      'Optional per-agent daily cap enforced against the pooled org balance',
    required: false,
  })
  readonly agentDailyCreditCap?: number | null;
}

export class AgentPolicyDto {
  @IsIn(AGENT_POLICY_QUALITY_TIERS)
  @IsOptional()
  @ApiProperty({
    default: 'balanced',
    description: 'Default quality tier for autonomous agent execution',
    enum: AGENT_POLICY_QUALITY_TIERS,
    required: false,
  })
  readonly qualityTierDefault?: AgentPolicyQualityTier;

  @IsEnum(AgentAutonomyMode)
  @IsOptional()
  @ApiProperty({
    default: AgentAutonomyMode.SUPERVISED,
    description: 'Default autonomy mode for autonomous agents',
    enum: AgentAutonomyMode,
    required: false,
  })
  readonly autonomyDefault?: AgentAutonomyMode;

  @ValidateNested()
  @Type(() => AgentCreditGovernanceDto)
  @IsOptional()
  @ApiProperty({
    description: 'Credit governance defaults for autonomous agents',
    required: false,
    type: AgentCreditGovernanceDto,
  })
  readonly creditGovernance?: AgentCreditGovernanceDto;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional advanced override for the planner/thinking model',
    required: false,
  })
  readonly thinkingModelOverride?: string | null;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional advanced override for generation model selection',
    required: false,
  })
  readonly generationModelOverride?: string | null;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional advanced override for review model selection',
    required: false,
  })
  readonly reviewModelOverride?: string | null;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether raw model override controls are exposed',
    required: false,
  })
  readonly allowAdvancedOverrides?: boolean;
}

export class OnboardingJourneyMissionStateDto {
  @IsString()
  @ValidateIf((_, value) =>
    ONBOARDING_JOURNEY_MISSIONS.some((mission) => mission.id === value),
  )
  @ApiProperty({
    enum: ONBOARDING_JOURNEY_MISSIONS.map((mission) => mission.id),
    required: true,
  })
  readonly id!: OnboardingJourneyMissionId;

  @IsBoolean()
  @ApiProperty({ required: true })
  readonly isCompleted!: boolean;

  @IsBoolean()
  @ApiProperty({ required: true })
  readonly rewardClaimed!: boolean;

  @IsNumber()
  @Min(0)
  @ApiProperty({ required: true })
  readonly rewardCredits!: number;

  @IsOptional()
  @ApiProperty({ required: false })
  readonly completedAt?: Date | string | null;
}

export class CreateOrganizationSettingDto {
  @ValidateNested({ each: true })
  @Type(() => OnboardingJourneyMissionStateDto)
  @IsOptional()
  @ApiProperty({
    description:
      'Tracked onboarding journey mission state for the organization',
    isArray: true,
    required: false,
    type: () => OnboardingJourneyMissionStateDto,
  })
  readonly onboardingJourneyMissions?: OnboardingJourneyMissionStateDto[];

  @IsOptional()
  @ApiProperty({
    description: 'Timestamp when the onboarding journey was fully completed',
    required: false,
  })
  readonly onboardingJourneyCompletedAt?: Date | string | null;

  @IsMongoId()
  @ApiProperty({ required: true })
  readonly organization!: Types.ObjectId;

  @IsBoolean()
  @ApiProperty({ default: false, required: true })
  readonly isWhitelabelEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({ default: false, required: true })
  readonly isVoiceControlEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether Discord notifications are enabled',
    required: true,
  })
  readonly isNotificationsDiscordEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether email notifications are enabled',
    required: true,
  })
  readonly isNotificationsEmailEnabled!: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether NSFW darkroom assets can be revealed in brand-scoped library surfaces',
    required: false,
  })
  readonly isDarkroomNsfwVisible?: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether watermarks are enabled on generated content',
    required: true,
  })
  readonly isWatermarkEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether script verification is enabled',
    required: true,
  })
  readonly isVerifyScriptEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether ingredient verification is enabled',
    required: true,
  })
  readonly isVerifyIngredientEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether video verification is enabled',
    required: true,
  })
  readonly isVerifyVideoEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether video generation is enabled',
    required: true,
  })
  readonly isGenerateVideosEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether article generation is enabled',
    required: true,
  })
  readonly isGenerateArticlesEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether image generation is enabled',
    required: true,
  })
  readonly isGenerateImagesEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether music generation is enabled',
    required: true,
  })
  readonly isGenerateMusicEnabled!: boolean;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description:
      'Whether content is automatically evaluated after generation (costs 1 credit per evaluation)',
    required: true,
  })
  readonly isAutoEvaluateEnabled!: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiProperty({ default: 3, required: false })
  readonly seatsLimit?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiProperty({ default: 5, required: false })
  readonly brandsLimit?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: 'UTC',
    description:
      'Organization timezone for scheduling (e.g., America/New_York, Europe/Paris)',
    required: false,
  })
  readonly timezone?: string;

  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether webhooks are enabled',
    required: true,
  })
  readonly isWebhookEnabled!: boolean;

  @IsString()
  @IsUrl()
  @IsOptional()
  @ApiProperty({
    description: 'Webhook endpoint URL',
    required: false,
  })
  readonly webhookEndpoint?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Webhook secret for signature verification',
    required: false,
  })
  readonly webhookSecret?: string;

  @IsMongoId({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Array of enabled model IDs for the organization',
    required: false,
    type: [String],
  })
  readonly enabledModels?: Types.ObjectId[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Subscription tier for the organization (free, creator, pro, scale, enterprise)',
    required: false,
  })
  readonly subscriptionTier?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether Advanced Mode is enabled — shows studio, workflow editor, and generation pages',
    required: false,
  })
  readonly isAdvancedMode?: boolean;

  @IsEnum(AgentReplyStyle)
  @IsOptional()
  @ApiProperty({
    default: AgentReplyStyle.CONCISE,
    description: 'Agent reply style preference',
    enum: AgentReplyStyle,
    required: false,
  })
  readonly agentReplyStyle?: AgentReplyStyle;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether BYOK (Bring Your Own Key) mode is enabled for AI providers',
    required: false,
  })
  readonly isByokEnabled?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'User-provided OpenRouter API key (encrypted at rest)',
    required: false,
  })
  readonly byokOpenrouterApiKey?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default avatar photo URL for identity generation',
    required: false,
  })
  readonly defaultAvatarPhotoUrl?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Default avatar ingredient ID for identity generation',
    required: false,
  })
  readonly defaultAvatarIngredientId?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Default cloned voice ingredient ID for identity generation',
    required: false,
  })
  readonly defaultVoiceId?: Types.ObjectId;

  @ValidateNested()
  @Type(() => DefaultVoiceRefDto)
  @IsOptional()
  @ApiProperty({
    description:
      'Provider-aware default voice reference for identity generation',
    required: false,
    type: DefaultVoiceRefDto,
  })
  readonly defaultVoiceRef?: DefaultVoiceRefDto;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default voice provider for identity generation',
    required: false,
  })
  readonly defaultVoiceProvider?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default text model for article generation',
    required: false,
  })
  readonly defaultModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default text model for article review',
    required: false,
  })
  readonly defaultModelReview?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default text model for article revision/update',
    required: false,
  })
  readonly defaultModelUpdate?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default image generation model for the organization',
    required: false,
  })
  readonly defaultImageModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default video generation model for the organization',
    required: false,
  })
  readonly defaultVideoModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default image-to-video generation model for the organization',
    required: false,
  })
  readonly defaultImageToVideoModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default music generation model for the organization',
    required: false,
  })
  readonly defaultMusicModel?: string;

  @ValidateNested()
  @Type(() => AgentPolicyDto)
  @IsOptional()
  @ApiProperty({
    description: 'Default autonomous agent policy for the organization',
    required: false,
    type: AgentPolicyDto,
  })
  readonly agentPolicy?: AgentPolicyDto;
}
