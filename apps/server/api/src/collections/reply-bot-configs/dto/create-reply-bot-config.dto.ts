import { ReplyBotDmConfigDto } from '@api/collections/reply-bot-configs/dto/reply-bot-dm-config.dto';
import { ReplyBotRateLimitsDto } from '@api/collections/reply-bot-configs/dto/reply-bot-rate-limits.dto';
import { ReplyBotScheduleDto } from '@api/collections/reply-bot-configs/dto/reply-bot-schedule.dto';
import {
  ReplyBotActionType,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

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
}

export class CreateReplyBotConfigDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Organization that owns this bot config',
    required: false,
  })
  organization?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Brand this bot config is scoped to',
    required: false,
  })
  brand?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'User that created this bot config',
    required: false,
  })
  user?: Types.ObjectId;

  @IsMongoId()
  @ApiProperty({
    description: 'Twitter credential to use for posting replies and DMs',
    required: true,
  })
  credential!: Types.ObjectId;

  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Name of the reply bot',
    example: 'Reply Guy Hunter',
  })
  label!: string;

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

  @IsEnum(ReplyTone)
  @IsOptional()
  @ApiProperty({
    default: ReplyTone.FRIENDLY,
    description: 'Tone for AI-generated replies',
    enum: ReplyTone,
    enumName: 'ReplyTone',
    required: false,
  })
  replyTone?: ReplyTone;

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
  customInstructions?: string;

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
  @IsMongoId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'IDs of monitored accounts (for ACCOUNT_MONITOR type)',
    required: false,
    type: [String],
  })
  monitoredAccounts?: Types.ObjectId[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether the bot is active',
    required: false,
  })
  isActive?: boolean;
}
