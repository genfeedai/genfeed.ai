import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignTargetStatus,
  CampaignTargetType,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCampaignTargetDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description:
      'Ignored when present. Organization is derived from the parent campaign.',
    required: false,
  })
  organizationId?: string;

  @IsEntityId()
  @ApiProperty({
    description: 'Campaign this target belongs to',
    required: true,
  })
  campaignId!: string;

  @IsEnum(CampaignPlatform)
  @ApiProperty({
    description: 'Platform of the target content',
    enum: CampaignPlatform,
    enumName: 'CampaignPlatform',
  })
  platform!: CampaignPlatform;

  @IsEnum(CampaignTargetType)
  @ApiProperty({
    description: 'Type of target content',
    enum: CampaignTargetType,
    enumName: 'CampaignTargetType',
  })
  targetType!: CampaignTargetType;

  @IsString()
  @ApiProperty({
    description: 'External ID of the content (tweet ID, Reddit post ID)',
    example: '1234567890',
  })
  externalId!: string;

  @IsString()
  @ApiProperty({
    description: 'URL of the target content',
    example: 'https://twitter.com/user/status/1234567890',
  })
  contentUrl!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Username of the content author',
    required: false,
  })
  authorUsername?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'External ID of the content author',
    required: false,
  })
  authorId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Username of a direct-message recipient',
    required: false,
  })
  recipientUsername?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Resolved user id of a direct-message recipient',
    required: false,
  })
  recipientUserId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Direct-message text to send or that was sent',
    required: false,
  })
  dmText?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({
    description: 'When the direct message was sent',
    required: false,
  })
  dmSentAt?: Date;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Text content of the target',
    required: false,
  })
  contentText?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({
    description: 'When the content was created',
    required: false,
  })
  contentCreatedAt?: Date;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Number of likes on the content',
    required: false,
  })
  likes?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Number of retweets on the content',
    required: false,
  })
  retweets?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Number of replies on the content',
    required: false,
  })
  replies?: number;

  @IsEnum(CampaignDiscoverySource)
  @IsOptional()
  @ApiProperty({
    default: CampaignDiscoverySource.MANUAL,
    description: 'How the target was discovered',
    enum: CampaignDiscoverySource,
    enumName: 'CampaignDiscoverySource',
    required: false,
  })
  discoverySource?: CampaignDiscoverySource;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Relevance score (0-1)',
    required: false,
  })
  relevanceScore?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Keyword that matched this target',
    required: false,
  })
  matchedKeyword?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({
    description: 'When to process this target',
    required: false,
  })
  scheduledAt?: Date;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    default: 1,
    description: 'Schedule version used to reject stale due-time claims',
    required: false,
  })
  scheduleVersion?: number;

  @IsEnum(CampaignTargetStatus)
  @IsOptional()
  @ApiProperty({
    default: CampaignTargetStatus.PENDING,
    description: 'Initial processing status',
    enum: CampaignTargetStatus,
    enumName: 'CampaignTargetStatus',
    required: false,
  })
  status?: CampaignTargetStatus;
}
