import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  SocialInboxPlatform,
  SocialMessageType,
  SocialReplyCampaignRecipientStatus,
  SocialReplyCampaignStatus,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Hard ceiling on a single campaign's enrollment. Campaigns drip one recipient
 * per tick, so a larger set is a scheduling problem, not a payload problem —
 * split it into several campaigns instead of raising this.
 */
const MAX_CAMPAIGN_RECIPIENTS = 500;

export class SocialReplyCampaignCreateDto {
  @ApiProperty({ maxLength: 120, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: SocialInboxPlatform })
  @IsEnum(SocialInboxPlatform)
  platform!: SocialInboxPlatform;

  @ApiProperty({
    enum: [SocialMessageType.REPLY, SocialMessageType.DM],
    required: false,
  })
  @IsOptional()
  @IsIn([SocialMessageType.REPLY, SocialMessageType.DM])
  messageType?: SocialMessageType.DM | SocialMessageType.REPLY;

  @ApiProperty({
    description:
      'Message body sent to every recipient. Supports {{handle}} and {{name}} placeholders.',
    maxLength: 5000,
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  bodyTemplate!: string;

  @ApiProperty({
    description: 'Conversations to enroll, in drain order.',
    maxItems: MAX_CAMPAIGN_RECIPIENTS,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CAMPAIGN_RECIPIENTS)
  @IsEntityId({ each: true })
  conversationIds!: string[];

  @ApiProperty({ default: 10, maximum: 500, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxPerHour?: number;

  @ApiProperty({ default: 50, maximum: 2000, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  maxPerDay?: number;

  @ApiProperty({ default: 60, maximum: 86400, minimum: 5, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(86_400)
  minDelaySeconds?: number;
}

export class SocialReplyCampaignUpdateDto {
  @ApiProperty({ maxLength: 120, minLength: 1, required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ maxLength: 5000, minLength: 1, required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  bodyTemplate?: string;

  @ApiProperty({ maximum: 500, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxPerHour?: number;

  @ApiProperty({ maximum: 2000, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  maxPerDay?: number;

  @ApiProperty({ maximum: 86400, minimum: 5, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(86_400)
  minDelaySeconds?: number;
}

const CAMPAIGN_TRANSITIONS = ['start', 'pause', 'resume', 'cancel'] as const;

export type SocialReplyCampaignTransition =
  (typeof CAMPAIGN_TRANSITIONS)[number];

/**
 * Lifecycle transition. Kept as one `PATCH /:campaignId/status` verb rather
 * than four action routes, mirroring the draft review DTO in this collection.
 */
export class SocialReplyCampaignStatusDto {
  @ApiProperty({ enum: CAMPAIGN_TRANSITIONS })
  @IsIn(CAMPAIGN_TRANSITIONS)
  transition!: SocialReplyCampaignTransition;
}

export class SocialReplyCampaignQueryDto extends BaseQueryDto {
  @ApiProperty({ enum: SocialInboxPlatform, required: false })
  @IsOptional()
  @IsEnum(SocialInboxPlatform)
  platform?: SocialInboxPlatform;

  @ApiProperty({ enum: SocialReplyCampaignStatus, required: false })
  @IsOptional()
  @IsEnum(SocialReplyCampaignStatus)
  status?: SocialReplyCampaignStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  brandId?: string;
}

export class SocialReplyCampaignRecipientQueryDto extends BaseQueryDto {
  @ApiProperty({ enum: SocialReplyCampaignRecipientStatus, required: false })
  @IsOptional()
  @IsEnum(SocialReplyCampaignRecipientStatus)
  status?: SocialReplyCampaignRecipientStatus;
}
