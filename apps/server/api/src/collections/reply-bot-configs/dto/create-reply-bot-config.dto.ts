import { ReplyBotDmConfigDto } from '@api/collections/reply-bot-configs/dto/reply-bot-dm-config.dto';
import { ReplyBotRateLimitsDto } from '@api/collections/reply-bot-configs/dto/reply-bot-rate-limits.dto';
import { ReplyBotScheduleDto } from '@api/collections/reply-bot-configs/dto/reply-bot-schedule.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
  ReplyLength,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReplyBotFiltersDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Only process comments containing these keywords',
    example: ['INFO', 'YES', 'SEND'],
    required: false,
    type: [String],
  })
  includeKeywords?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Skip comments containing these keywords',
    required: false,
    type: [String],
  })
  excludeKeywords?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Skip candidates from these author usernames',
    required: false,
    type: [String],
  })
  excludeAuthors?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Skip candidates from these platform author IDs',
    required: false,
    type: [String],
  })
  excludeAuthorIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    default: [],
    description: 'Skip candidates whose canonical URL contains these values',
    required: false,
    type: [String],
  })
  excludeUrls?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Minimum follower count for comment author',
    minimum: 0,
    required: false,
  })
  minFollowers?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Maximum follower count for candidate author',
    minimum: 0,
    required: false,
  })
  maxFollowers?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Skip candidates older than this many hours',
    minimum: 0,
    required: false,
  })
  maxAgeHours?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    description: 'Minimum candidate text length before drafting',
    minimum: 0,
    required: false,
  })
  minTextLength?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  languageFilter?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: false, required: false })
  mustHaveBio?: boolean;
}

export class CreateReplyBotConfigDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Brand this bot is scoped to (required for author-reply loop)',
    required: false,
  })
  brandId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Platform credential used by this bot',
    required: false,
  })
  credentialId?: string;

  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Name of the reply bot',
    example: 'Reply Guy Hunter',
  })
  name!: string;

  @IsString()
  @MaxLength(512)
  @IsOptional()
  @ApiProperty({
    description: 'Description of what this bot does',
    required: false,
  })
  description?: string;

  @IsEnum(ReplyBotType)
  @ApiProperty({
    description: 'Type of reply bot',
    enum: ReplyBotType,
    enumName: 'ReplyBotType',
    example: ReplyBotType.REPLY_GUY,
  })
  type!: ReplyBotType;

  @IsEnum(ReplyBotPlatform)
  @ApiProperty({
    description: 'Platform handled by this bot',
    enum: ReplyBotPlatform,
    enumName: 'ReplyBotPlatform',
  })
  platform!: ReplyBotPlatform;

  @IsEnum(ReplyBotActionType)
  @IsOptional()
  @ApiProperty({
    default: ReplyBotActionType.REPLY_ONLY,
    description: 'Action to take when triggered',
    enum: ReplyBotActionType,
    enumName: 'ReplyBotActionType',
    required: false,
  })
  actionType?: ReplyBotActionType;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiProperty({
    description: 'Tone or voice for AI-generated replies',
    required: false,
  })
  replyTone?: string;

  @IsEnum(ReplyLength)
  @IsOptional()
  @ApiProperty({
    default: ReplyLength.MEDIUM,
    description: 'Preferred length of replies',
    enum: ReplyLength,
    enumName: 'ReplyLength',
    required: false,
  })
  replyLength?: ReplyLength;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiProperty({
    description: 'Custom instructions for AI reply generation',
    example: 'Always mention our product name and include a call to action',
    required: false,
  })
  replyInstructions?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiProperty({
    description: 'Context about your brand/product for AI to use',
    example:
      'We are a SaaS startup that helps content creators grow their audience',
    required: false,
  })
  context?: string;

  @ValidateNested()
  @Type(() => ReplyBotDmConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'DM configuration',
    required: false,
    type: ReplyBotDmConfigDto,
  })
  dmConfig?: ReplyBotDmConfigDto;

  @ValidateNested()
  @Type(() => ReplyBotRateLimitsDto)
  @IsOptional()
  @ApiProperty({
    description: 'Rate limit configuration',
    required: false,
    type: ReplyBotRateLimitsDto,
  })
  rateLimits?: ReplyBotRateLimitsDto;

  @ValidateNested()
  @Type(() => ReplyBotScheduleDto)
  @IsOptional()
  @ApiProperty({
    description: 'Schedule configuration',
    required: false,
    type: ReplyBotScheduleDto,
  })
  schedule?: ReplyBotScheduleDto;

  @ValidateNested()
  @Type(() => ReplyBotFiltersDto)
  @IsOptional()
  @ApiProperty({
    description: 'Keyword and audience filters',
    required: false,
    type: ReplyBotFiltersDto,
  })
  filters?: ReplyBotFiltersDto;

  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'IDs of monitored accounts (for ACCOUNT_MONITOR type)',
    required: false,
    type: [String],
  })
  monitoredAccountIds?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether the bot is active',
    required: false,
  })
  isActive?: boolean;
}
