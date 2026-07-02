import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const SOCIAL_PLATFORMS = [
  'youtube',
  'instagram',
  'twitter',
  'linkedin',
  'unipile',
] as const;

const CONVERSATION_STATUSES = [
  'open',
  'needs_review',
  'resolved',
  'archived',
] as const;

const AUTOMATION_STATES = [
  'manual',
  'drafted',
  'pending_approval',
  'approved',
  'automated',
  'failed',
] as const;

const CONVERSATION_TYPES = ['comment', 'dm', 'mention', 'reply'] as const;

export class SocialInboxQueryDto extends BaseQueryDto {
  @ApiProperty({ enum: SOCIAL_PLATFORMS, required: false })
  @IsOptional()
  @IsIn(SOCIAL_PLATFORMS)
  platform?: string;

  @ApiProperty({ enum: CONVERSATION_STATUSES, required: false })
  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: string;

  @ApiProperty({ enum: AUTOMATION_STATES, required: false })
  @IsOptional()
  @IsIn(AUTOMATION_STATES)
  automationState?: string;

  @ApiProperty({ enum: CONVERSATION_TYPES, required: false })
  @IsOptional()
  @IsIn(CONVERSATION_TYPES)
  conversationType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  credentialId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  assignedOwnerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  needsReview?: boolean;
}

export class SocialMessagesQueryDto extends BaseQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cursor?: string;
}
