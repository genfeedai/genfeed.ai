import {
  MAX_CONFIGURED_SKILL_SLUGS,
  MAX_SKILL_SLUG_LENGTH,
} from '@api/collections/skills/constants/skill-validation.constant';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { DefaultVoiceRefDto } from '@api/shared/default-voice-ref/default-voice-ref.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Every *patchable* field in this DTO family is optional by design.
 *
 * `PATCH /brands/:id/agent-config` is a partial update: `BrandsService
 * .updateAgentConfig` merges the payload over the stored config and skips
 * `undefined`, so an omitted field means "leave unchanged". A patchable field
 * declared without `@IsOptional()` inverts that contract — the pipe validates
 * with neither `skipMissingProperties` nor `skipUndefinedProperties`, so every
 * value-constraint decorator (`@IsArray`, `@IsString`, `@IsBoolean`, …) fires
 * on `undefined` and rejects the whole request with a 400. Only
 * `@ValidateNested()` tolerates absence, which is why the missing
 * An undefined-only `@ValidateIf()` is used on `enabledSkills`: omission must
 * skip validation, while explicit `null` must still be rejected instead of
 * reaching the JSON persistence boundary.
 *
 * The exception is `UpdateBrandPromptSeedDto` and
 * `UpdateBrandConversationStarterDto`: those are value objects *inside* an
 * array that is replaced wholesale, never patch targets, so their fields stay
 * required — a half-built seed or starter is not a valid element.
 */
export class UpdateBrandAgentVoiceDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Brand voice tone', required: false })
  tone?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Brand voice style', required: false })
  style?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Target audience',
    required: false,
    type: [String],
  })
  audience?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Core brand values',
    required: false,
    type: [String],
  })
  values?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Brand taglines',
    required: false,
    type: [String],
  })
  taglines?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Preferred hashtags',
    required: false,
    type: [String],
  })
  hashtags?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Core messaging pillars for the brand',
    required: false,
    type: [String],
  })
  messagingPillars?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Phrases or styles the brand should avoid',
    required: false,
    type: [String],
  })
  doNotSoundLike?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  @ApiProperty({
    description: 'Representative sample output for the approved brand voice',
    required: false,
  })
  sampleOutput?: string;

  @IsString()
  @IsOptional()
  @IsIn(['brand', 'founder', 'hybrid'])
  @ApiProperty({
    description: 'Canonical source of truth for the voice profile',
    enum: ['brand', 'founder', 'hybrid'],
    required: false,
  })
  canonicalSource?: 'brand' | 'founder' | 'hybrid';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Approved hook patterns for high-performing content',
    required: false,
    type: [String],
  })
  approvedHooks?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Banned phrases that should never appear in output',
    required: false,
    type: [String],
  })
  bannedPhrases?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Format-agnostic writing rules for generated content',
    required: false,
    type: [String],
  })
  writingRules?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Reference exemplars that capture the desired voice',
    required: false,
    type: [String],
  })
  exemplarTexts?: string[];
}

export class UpdateBrandAgentStrategyDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Enabled content types',
    required: false,
    type: [String],
  })
  contentTypes?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Target platforms',
    required: false,
    type: [String],
  })
  platforms?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Publishing frequency descriptor',
    required: false,
  })
  frequency?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Primary strategic goals',
    required: false,
    type: [String],
  })
  goals?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Canonical content topics for prompt personalization',
    required: false,
    type: [String],
  })
  topics?: string[];
}

export class UpdateBrandPromptSeedDto {
  @IsString()
  @MaxLength(200)
  @ApiProperty({
    description: 'Reusable content angle grounded in the brand profile',
    maxLength: 200,
  })
  angle!: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty({
    description: 'Audience segment the prompt seed should address',
    maxLength: 200,
  })
  audience!: string;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Content formats suited to this prompt seed',
    type: [String],
  })
  preferredFormats!: string[];

  @IsString()
  @MaxLength(200)
  @ApiProperty({
    description: 'Canonical brand topic used by this prompt seed',
    maxLength: 200,
  })
  topic!: string;
}

export class UpdateBrandConversationStarterDto {
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Stable identifier for the conversation starter',
    maxLength: 120,
  })
  id!: string;

  @IsIn(['analyze', 'create', 'plan'])
  @ApiProperty({
    description: 'Agent intent represented by the conversation starter',
    enum: ['analyze', 'create', 'plan'],
  })
  intent!: 'analyze' | 'create' | 'plan';

  @IsString()
  @MaxLength(32)
  @ApiProperty({
    description: 'Short prompt-bar label',
    maxLength: 32,
  })
  label!: string;

  @IsString()
  @MaxLength(220)
  @ApiProperty({
    description: 'Prompt inserted when the starter is selected',
    maxLength: 220,
  })
  prompt!: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty({
    description: 'Canonical brand topic used by the starter',
    maxLength: 200,
  })
  topic!: string;
}

export class UpdateBrandAgentPromptingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBrandConversationStarterDto)
  @IsOptional()
  @ApiProperty({
    description: 'Top conversation starters generated with the brand profile',
    isArray: true,
    required: false,
    type: UpdateBrandConversationStarterDto,
  })
  conversationStarters?: UpdateBrandConversationStarterDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBrandPromptSeedDto)
  @IsOptional()
  @ApiProperty({
    description: 'Reusable prompt seeds generated with the brand profile',
    isArray: true,
    required: false,
    type: UpdateBrandPromptSeedDto,
  })
  seeds?: UpdateBrandPromptSeedDto[];
}

export class UpdateBrandAgentScheduleDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Cron expression used for scheduled runs',
    required: false,
  })
  cronExpression?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'IANA timezone', required: false })
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Whether schedule is active', required: false })
  enabled?: boolean;
}

export class UpdateBrandAgentAutoPublishDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether auto publish is enabled',
    required: false,
  })
  enabled?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @ApiProperty({
    description: 'Confidence threshold for auto publishing',
    required: false,
  })
  confidenceThreshold?: number;
}

export class UpdateBrandAgentPlatformOverrideDto {
  @ValidateNested()
  @Type(() => UpdateBrandAgentVoiceDto)
  @IsOptional()
  @ApiProperty({
    description: 'Platform-specific voice override',
    required: false,
    type: UpdateBrandAgentVoiceDto,
  })
  voice?: UpdateBrandAgentVoiceDto;

  @ValidateNested()
  @Type(() => UpdateBrandAgentStrategyDto)
  @IsOptional()
  @ApiProperty({
    description: 'Platform-specific strategy override',
    required: false,
    type: UpdateBrandAgentStrategyDto,
  })
  strategy?: UpdateBrandAgentStrategyDto;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Platform-specific default model override',
    required: false,
  })
  defaultModel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  @ApiProperty({
    description: 'Platform-specific persona override',
    required: false,
  })
  persona?: string;
}

export class UpdateBrandAgentConfigDto {
  @ValidateNested()
  @Type(() => UpdateBrandAgentVoiceDto)
  @IsOptional()
  @ApiProperty({ required: false, type: UpdateBrandAgentVoiceDto })
  voice?: UpdateBrandAgentVoiceDto;

  @ValidateNested()
  @Type(() => UpdateBrandAgentStrategyDto)
  @IsOptional()
  @ApiProperty({ required: false, type: UpdateBrandAgentStrategyDto })
  strategy?: UpdateBrandAgentStrategyDto;

  @ValidateNested()
  @Type(() => UpdateBrandAgentPromptingDto)
  @IsOptional()
  @ApiProperty({
    description: 'Persisted prompt seeds and conversation starters',
    required: false,
    type: UpdateBrandAgentPromptingDto,
  })
  prompting?: UpdateBrandAgentPromptingDto;

  @IsArray()
  @ArrayMaxSize(MAX_CONFIGURED_SKILL_SLUGS)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_SKILL_SLUG_LENGTH, { each: true })
  @Matches(/\S/u, {
    each: true,
    message: 'each skill slug must contain a non-whitespace character',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @ApiProperty({
    description: 'Enabled skill slugs',
    maxItems: MAX_CONFIGURED_SKILL_SLUGS,
    required: false,
    type: [String],
  })
  enabledSkills?: string[];

  @ValidateNested()
  @Type(() => UpdateBrandAgentScheduleDto)
  @IsOptional()
  @ApiProperty({ required: false, type: UpdateBrandAgentScheduleDto })
  schedule?: UpdateBrandAgentScheduleDto;

  @ValidateNested()
  @Type(() => UpdateBrandAgentAutoPublishDto)
  @IsOptional()
  @ApiProperty({ required: false, type: UpdateBrandAgentAutoPublishDto })
  autoPublish?: UpdateBrandAgentAutoPublishDto;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Default agent model key', required: false })
  defaultModel?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Default cloned voice ingredient ID for identity generation',
    required: false,
  })
  defaultVoiceId?: string;

  @ValidateNested()
  @Type(() => DefaultVoiceRefDto)
  @IsOptional()
  @ApiProperty({
    description:
      'Provider-aware default voice reference for identity generation',
    required: false,
    type: DefaultVoiceRefDto,
  })
  defaultVoiceRef?: DefaultVoiceRefDto;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Default avatar photo URL for identity generation',
    required: false,
  })
  defaultAvatarPhotoUrl?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Default avatar ingredient ID for identity generation',
    required: false,
  })
  defaultAvatarIngredientId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiProperty({
    description: 'Default HeyGen avatar ID for facecam tasks',
    required: false,
  })
  heygenAvatarId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  @ApiProperty({
    description: 'Default HeyGen voice ID for facecam tasks',
    required: false,
  })
  heygenVoiceId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  @ApiProperty({
    description: 'Custom agent persona/system prompt',
    required: false,
  })
  persona?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    additionalProperties: {
      $ref: '#/components/schemas/UpdateBrandAgentPlatformOverrideDto',
    },
    description:
      'Platform-keyed overrides for voice, strategy, persona, and model',
    required: false,
    type: Object,
  })
  @IsOptional()
  @IsObject()
  platformOverrides?: Record<string, UpdateBrandAgentPlatformOverrideDto>;
}
