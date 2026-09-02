import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  SocialAutomationState,
  SocialConversationStatus,
  SocialConversationType,
  SocialInboxPlatform,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class SocialInboxQueryDto extends BaseQueryDto {
  @ApiProperty({ enum: SocialInboxPlatform, required: false })
  @IsOptional()
  @IsEnum(SocialInboxPlatform)
  platform?: SocialInboxPlatform;

  @ApiProperty({
    description:
      'Optional brand filter. When omitted, session brand scope still applies unless allBrands is true.',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({
    description:
      'List every brand in the organization, ignoring session brand scope.',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allBrands?: boolean;

  @ApiProperty({ enum: SocialConversationStatus, required: false })
  @IsOptional()
  @IsEnum(SocialConversationStatus)
  status?: SocialConversationStatus;

  @ApiProperty({ enum: SocialAutomationState, required: false })
  @IsOptional()
  @IsEnum(SocialAutomationState)
  automationState?: SocialAutomationState;

  @ApiProperty({ enum: SocialConversationType, required: false })
  @IsOptional()
  @IsEnum(SocialConversationType)
  conversationType?: SocialConversationType;

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
