import { BotPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum BotLivestreamMessageTypeValue {
  SCHEDULED_LINK_DROP = 'scheduled_link_drop',
  SCHEDULED_HOST_PROMPT = 'scheduled_host_prompt',
  CONTEXT_AWARE_QUESTION = 'context_aware_question',
}

export enum BotLivestreamTargetAudienceValue {
  HOSTS = 'hosts',
  AUDIENCE = 'audience',
}

export class BotLivestreamLinkDto {
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Stable identifier for the reusable livestream link',
    example: 'show-notes',
  })
  id!: string;

  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Human readable label for the livestream link',
    example: 'Show Notes',
  })
  label!: string;

  @IsUrl()
  @ApiProperty({
    description: 'URL dropped into livestream chat',
    example: 'https://genfeed.ai/show-notes',
  })
  url!: string;
}

export class BotLivestreamMessageTemplateDto {
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Stable identifier for the template',
    example: 'context-question',
  })
  id!: string;

  @IsEnum(BotLivestreamMessageTypeValue)
  @ApiProperty({
    description: 'Livestream message category',
    enum: BotLivestreamMessageTypeValue,
    enumName: 'BotLivestreamMessageTypeValue',
  })
  type!: BotLivestreamMessageTypeValue;

  @IsString()
  @MaxLength(1000)
  @ApiProperty({
    description: 'Template body supporting {{topic}} and link placeholders',
  })
  text!: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether this template can be used automatically',
    required: false,
  })
  enabled?: boolean = true;

  @IsArray()
  @IsEnum(BotPlatform, { each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Optional platform allow-list for this template',
    enum: BotPlatform,
    enumName: 'BotPlatform',
    required: false,
    type: [String],
  })
  platforms?: BotPlatform[];
}

export class BotLivestreamSettingsDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether the livestream bot posts automatically',
    required: false,
  })
  automaticPosting?: boolean = true;

  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  @ApiProperty({
    default: 10,
    description: 'Minutes between scheduled drops',
    maximum: 120,
    minimum: 1,
    required: false,
  })
  scheduledCadenceMinutes?: number = 10;

  @IsInt()
  @Min(15)
  @Max(600)
  @IsOptional()
  @ApiProperty({
    default: 90,
    description: 'Minimum gap between any two automatic posts on a platform',
    maximum: 600,
    minimum: 15,
    required: false,
  })
  minimumMessageGapSeconds?: number = 90;

  @IsInt()
  @Min(1)
  @Max(60)
  @IsOptional()
  @ApiProperty({
    default: 6,
    description: 'Maximum automatic posts per hour on one platform',
    maximum: 60,
    minimum: 1,
    required: false,
  })
  maxAutoPostsPerHour?: number = 6;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether transcript-assisted context is enabled',
    required: false,
  })
  transcriptEnabled?: boolean = true;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  @ApiProperty({
    default: 3,
    description: 'Rolling transcript lookback window in minutes',
    maximum: 10,
    minimum: 1,
    required: false,
  })
  transcriptLookbackMinutes?: number = 3;

  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  @ApiProperty({
    default: 15,
    description: 'Minutes that a producer override stays active',
    maximum: 120,
    minimum: 1,
    required: false,
  })
  manualOverrideTtlMinutes?: number = 15;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether YouTube should be prioritized in the operator flow',
    required: false,
  })
  prioritizeYoutube?: boolean = true;

  @IsArray()
  @IsEnum(BotLivestreamTargetAudienceValue, { each: true })
  @IsOptional()
  @ApiProperty({
    default: [BotLivestreamTargetAudienceValue.AUDIENCE],
    description: 'Audience groups this bot should address in public chat',
    enum: BotLivestreamTargetAudienceValue,
    enumName: 'BotLivestreamTargetAudienceValue',
    required: false,
    type: [String],
  })
  targetAudience?: BotLivestreamTargetAudienceValue[] = [
    BotLivestreamTargetAudienceValue.AUDIENCE,
  ];

  @ValidateNested({ each: true })
  @Type(() => BotLivestreamLinkDto)
  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'Reusable links for scheduled drops',
    required: false,
    type: [BotLivestreamLinkDto],
  })
  links?: BotLivestreamLinkDto[];

  @ValidateNested({ each: true })
  @Type(() => BotLivestreamMessageTemplateDto)
  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'Reusable livestream message templates',
    required: false,
    type: [BotLivestreamMessageTemplateDto],
  })
  messageTemplates?: BotLivestreamMessageTemplateDto[];
}
