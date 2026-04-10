import { DefaultVoiceRefDto } from '@api/shared/default-voice-ref/default-voice-ref.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateBrandAgentVoiceDto {
  @IsString()
  @ApiProperty({ description: 'Brand voice tone' })
  tone!: string;

  @IsString()
  @ApiProperty({ description: 'Brand voice style' })
  style!: string;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Target audience', type: [String] })
  audience!: string[];

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Core brand values', type: [String] })
  values!: string[];

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Brand taglines', type: [String] })
  taglines!: string[];

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Preferred hashtags', type: [String] })
  hashtags!: string[];

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
  @ApiProperty({ description: 'Enabled content types', type: [String] })
  contentTypes!: string[];

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Target platforms', type: [String] })
  platforms!: string[];

  @IsString()
  @ApiProperty({ description: 'Publishing frequency descriptor' })
  frequency!: string;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Primary strategic goals', type: [String] })
  goals!: string[];
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
  @ApiProperty({ description: 'Whether schedule is active' })
  enabled!: boolean;
}

export class UpdateBrandAgentAutoPublishDto {
  @IsBoolean()
  @ApiProperty({ description: 'Whether auto publish is enabled' })
  enabled!: boolean;

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
  @ApiProperty({ type: UpdateBrandAgentVoiceDto })
  voice!: UpdateBrandAgentVoiceDto;

  @ValidateNested()
  @Type(() => UpdateBrandAgentStrategyDto)
  @ApiProperty({ type: UpdateBrandAgentStrategyDto })
  strategy!: UpdateBrandAgentStrategyDto;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Enabled skill IDs', type: [String] })
  enabledSkills!: string[];

  @ValidateNested()
  @Type(() => UpdateBrandAgentScheduleDto)
  @ApiProperty({ type: UpdateBrandAgentScheduleDto })
  schedule!: UpdateBrandAgentScheduleDto;

  @ValidateNested()
  @Type(() => UpdateBrandAgentAutoPublishDto)
  @ApiProperty({ type: UpdateBrandAgentAutoPublishDto })
  autoPublish!: UpdateBrandAgentAutoPublishDto;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Default agent model key', required: false })
  defaultModel?: string;

  @IsMongoId()
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

  @IsMongoId()
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
  platformOverrides?: Record<string, UpdateBrandAgentPlatformOverrideDto>;
}
