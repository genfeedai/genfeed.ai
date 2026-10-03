import { MarginInputMode, type ModerationCategory } from '@genfeedai/contracts';
import type { PlatformFlagKey } from '@genfeedai/contracts/constants';
import {
  EMAIL_ADDRESS_PATTERN,
  isPlatformFlagKey,
  MODERATION_PROVIDER_NAMES,
  PLATFORM_FEATURE_SETTING_BOUNDS,
  parseModerationThresholdOverrides,
  SHADOW_CAPPED_DECISION_MODES,
  TYPED_DECISION_MODES,
  TYPED_DECISION_PROVIDER_NAMES,
} from '@genfeedai/contracts/constants';
import type {
  ModerationProviderName,
  ShadowCappedDecisionMode,
  TypedDecisionMode,
  TypedDecisionProviderName,
} from '@genfeedai/contracts/interfaces';
import { MAX_MARGIN_MULTIPLIER } from '@genfeedai/pricing';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';

const { confidence, mediaPerceptionFrameCount, mediaPerceptionLookbackHours } =
  PLATFORM_FEATURE_SETTING_BOUNDS;

/**
 * A plain object whose every key is a moderation category and every value a
 * confidence in 0..1 — exactly what `parseModerationThresholdOverrides` keeps,
 * so a stored map is never silently trimmed on read.
 */
function IsModerationThresholdOverrides(): PropertyDecorator {
  return ValidateBy({
    name: 'isModerationThresholdOverrides',
    validator: {
      defaultMessage: () =>
        'moderationThresholds must map moderation categories to a confidence between 0 and 1',
      validate: (value: unknown) =>
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(parseModerationThresholdOverrides(value)).length ===
          Object.keys(value).length,
    },
  });
}

/** A plain object mapping registered platform flag keys to booleans. */
function IsPlatformFlagPatch(): PropertyDecorator {
  return ValidateBy({
    name: 'isPlatformFlagPatch',
    validator: {
      defaultMessage: () =>
        'flags must map registered platform flag keys to true or false',
      validate: (value: unknown) =>
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.entries(value).every(
          ([key, isOn]) => isPlatformFlagKey(key) && typeof isOn === 'boolean',
        ),
    },
  });
}

function ConfidenceProperty(description: string): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    ApiProperty({
      description,
      maximum: confidence.max,
      minimum: confidence.min,
      required: false,
    })(target, propertyKey);
    IsOptional()(target, propertyKey);
    IsNumber()(target, propertyKey);
    Min(confidence.min)(target, propertyKey);
    Max(confidence.max)(target, propertyKey);
  };
}

function ModeProperty(
  description: string,
  modes: readonly string[],
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    ApiProperty({ description, enum: modes, required: false })(
      target,
      propertyKey,
    );
    IsOptional()(target, propertyKey);
    IsIn(modes)(target, propertyKey);
  };
}

function SwitchProperty(description: string): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    ApiProperty({ description, required: false, type: Boolean })(
      target,
      propertyKey,
    );
    IsOptional()(target, propertyKey);
    IsBoolean()(target, propertyKey);
  };
}

/**
 * Operator-editable fields of the platform-settings singleton. Intentionally
 * NOT a PartialType of the create DTO: the singleton `key` must never be
 * mutable via the API, or a PATCH could rename the canonical row and orphan it
 * (workers would then miss it and fall back to default pricing).
 */
export class UpdatePlatformSettingDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly imageCompressionQuality?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000000)
  readonly paygFallbackCredits?: number;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly linkedinTrendSourceUrls?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly agentContextCompressionModel?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(200)
  readonly agentContextWindowSize?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(128000)
  readonly generationMaxTokens?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(60000)
  readonly typedDecisionTimeoutMs?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  readonly trainingCreditsCost?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  readonly customModelCreditsCost?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly replicateModelHardware?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @IsIn(['private', 'public'])
  readonly replicateModelVisibility?: 'private' | 'public';

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly replicateTrainerModel?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(120)
  readonly replicateTargetFps?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly replicateTargetResolution?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly klingModel?: string;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly elevenlabsModel?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly murekaModel?: string;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @Matches(/^\d{17,20}$/)
  readonly discordChannelIdDeployments?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @Matches(/^\d{17,20}$/)
  readonly discordChannelIdPosts?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @Matches(/^\d{17,20}$/)
  readonly discordChannelIdStudio?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @Matches(/^\d{17,20}$/)
  readonly discordChannelIdUsers?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @Matches(/^\d{17,20}$/)
  readonly discordChannelIdModels?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  readonly discordBotAvatarUrl?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly discordWebhookNamePrefix?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  readonly discordWebhookReason?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @Matches(EMAIL_ADDRESS_PATTERN)
  readonly emailFromAddress?: string | null;

  @ValidateIf(
    (_object, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  @IsEmail()
  readonly emailReplyToAddress?: string | null;

  @ApiProperty({
    description:
      'Generation sell/cost ratio applied to provider USD. 3.33 = 70% margin on sell price.',
    maximum: MAX_MARGIN_MULTIPLIER,
    minimum: 0.01,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_MARGIN_MULTIPLIER)
  readonly marginMultiplierGeneration?: number;

  @ApiProperty({
    description:
      'Agent-chat sell/cost ratio applied to provider USD. 1.7 = 70% markup on provider cost.',
    maximum: MAX_MARGIN_MULTIPLIER,
    minimum: 0.01,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_MARGIN_MULTIPLIER)
  readonly marginMultiplierAgentChat?: number;

  @IsEnum(MarginInputMode)
  @IsOptional()
  @ApiProperty({
    default: MarginInputMode.MARGIN,
    description:
      'How the two margin multipliers above are typed and read in /admin: a markup percent on provider cost, or a margin percent on sell price. Never changes what is stored or billed.',
    enum: MarginInputMode,
    enumName: 'MarginInputMode',
    required: false,
  })
  readonly marginInputMode?: MarginInputMode;

  @ApiProperty({
    description:
      'Which provider answers typed decisions. `none` keeps every migrated decision point on its deterministic path.',
    enum: TYPED_DECISION_PROVIDER_NAMES,
    required: false,
  })
  @IsOptional()
  @IsIn(TYPED_DECISION_PROVIDER_NAMES)
  readonly typedDecisionProvider?: TypedDecisionProviderName;

  // Product feature switches (#5407). Defaults equal the retired env vars.

  @SwitchProperty(
    'Media perception sweep (#4879). `false` stops the workers enqueuing assets.',
  )
  readonly isMediaPerceptionEnabled?: boolean;

  @ApiProperty({
    description: 'Evenly spaced stills sampled per video.',
    maximum: mediaPerceptionFrameCount.max,
    minimum: mediaPerceptionFrameCount.min,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(mediaPerceptionFrameCount.min)
  @Max(mediaPerceptionFrameCount.max)
  readonly mediaPerceptionFrameCount?: number;

  @ApiProperty({
    description:
      'How far back, in hours, the sweep looks for unperceived assets.',
    maximum: mediaPerceptionLookbackHours.max,
    minimum: mediaPerceptionLookbackHours.min,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(mediaPerceptionLookbackHours.min)
  @Max(mediaPerceptionLookbackHours.max)
  readonly mediaPerceptionLookbackHours?: number;

  @ApiProperty({
    description:
      'Scene-description vision model. `null` or empty uses the fast text default.',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly mediaPerceptionVisionModel?: string | null;

  @ModeProperty('Vision-evaluation flags (#4881).', TYPED_DECISION_MODES)
  readonly mediaGateVisionMode?: TypedDecisionMode;

  @ModeProperty(
    'Text decisions on perception output (#4882).',
    TYPED_DECISION_MODES,
  )
  readonly mediaTextGateDecisionMode?: TypedDecisionMode;

  @ConfidenceProperty(
    'Minimum confidence for a `false` text decision to count.',
  )
  readonly mediaTextGateMinConfidence?: number;

  @ModeProperty('Moderation gate (#4880).', TYPED_DECISION_MODES)
  readonly moderationMode?: TypedDecisionMode;

  @ApiProperty({
    description:
      'Moderation classifier. `openai` needs OPENAI_API_KEY on the server.',
    enum: MODERATION_PROVIDER_NAMES,
    required: false,
  })
  @IsOptional()
  @IsIn(MODERATION_PROVIDER_NAMES)
  readonly moderationProvider?: ModerationProviderName;

  @ApiProperty({
    description:
      'Per-category overrides of the default moderation thresholds, e.g. `{"sexual":0.5}`. Lower is stricter.',
    required: false,
    type: Object,
  })
  @IsOptional()
  @IsModerationThresholdOverrides()
  readonly moderationThresholds?: Partial<Record<ModerationCategory, number>>;

  @ModeProperty('Agent auto-routing (#4865).', TYPED_DECISION_MODES)
  readonly agentAutoRoutingDecisionMode?: TypedDecisionMode;

  @ModeProperty(
    'Model-discovery category decision (#4869).',
    TYPED_DECISION_MODES,
  )
  readonly modelDiscoveryDecisionMode?: TypedDecisionMode;

  @ConfidenceProperty('Model-discovery minimum confidence.')
  readonly modelDiscoveryMinConfidence?: number;

  @ModeProperty(
    'Pattern-analyzer labels (#4868). Capped at shadow.',
    SHADOW_CAPPED_DECISION_MODES,
  )
  readonly patternAnalyzerDecisionMode?: ShadowCappedDecisionMode;

  @ConfidenceProperty('Pattern-analyzer minimum confidence.')
  readonly patternAnalyzerMinConfidence?: number;

  @ModeProperty('Reply-bot intent (#4866).', TYPED_DECISION_MODES)
  readonly replyBotIntentDecisionMode?: TypedDecisionMode;

  @ConfidenceProperty('Reply-bot intent minimum confidence.')
  readonly replyBotIntentMinConfidence?: number;

  @ModeProperty(
    'Task-routing output type (#4867). Capped at shadow.',
    SHADOW_CAPPED_DECISION_MODES,
  )
  readonly taskRoutingDecisionMode?: ShadowCappedDecisionMode;

  @ConfidenceProperty('Task-routing minimum confidence.')
  readonly taskRoutingMinConfidence?: number;

  @ModeProperty(
    'Untrusted-content gate (#4870). Live activation is closed.',
    SHADOW_CAPPED_DECISION_MODES,
  )
  readonly untrustedContentDecisionMode?: ShadowCappedDecisionMode;

  @ConfidenceProperty('Untrusted-content minimum confidence.')
  readonly untrustedContentMinConfidence?: number;

  @SwitchProperty('Summarise older agent-thread turns to fit the context.')
  readonly isAgentContextCompressionEnabled?: boolean;

  @SwitchProperty('Real token-by-token agent streaming.')
  readonly isAgentTokenStreamingEnabled?: boolean;

  @ApiProperty({
    description:
      'ISO timestamp from which signup and billing system events are recorded. `null` disables recording.',
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsISO8601()
  readonly systemEventsEnabledAt?: string | null;

  @SwitchProperty(
    'Email/password accounts must verify their email before signing in.',
  )
  readonly isEmailVerificationRequired?: boolean;

  @ApiProperty({
    description:
      'Module and feature flags to change (#5468), e.g. `{"studio":false}`. Omitted flags keep their value.',
    required: false,
    type: Object,
  })
  @IsOptional()
  @IsPlatformFlagPatch()
  readonly flags?: Partial<Record<PlatformFlagKey, boolean>>;
}
