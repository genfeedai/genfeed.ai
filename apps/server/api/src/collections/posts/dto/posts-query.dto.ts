import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostsQueryDto extends BaseQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @ApiProperty({
    description:
      'Separate posts that have been published from work in progress',
    enum: ['posted', 'not-posted'],
    required: false,
  })
  @IsOptional()
  @IsIn(['posted', 'not-posted'])
  publicationState?: 'posted' | 'not-posted';

  @ApiProperty({
    description: 'Search post labels and descriptions',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter posts scheduled after this date (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Filter posts scheduled before this date (ISO 8601 format)',
    example: '2024-01-31T23:59:59.999Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Filter posts by platform',
    enum: CredentialPlatform,
    enumName: 'CredentialPlatform',
    example: CredentialPlatform.YOUTUBE,
    required: false,
  })
  @IsOptional()
  @IsEnum(CredentialPlatform)
  platform?: CredentialPlatform;

  @ApiProperty({
    description: 'Filter posts by canonical target execution state',
    enum: TargetExecutionState,
    enumName: 'TargetExecutionState',
    required: false,
  })
  @IsOptional()
  @IsEnum(TargetExecutionState)
  executionState?: TargetExecutionState;

  @ApiProperty({
    description: 'Filter posts by audience visibility',
    enum: PostVisibility,
    enumName: 'PostVisibility',
    required: false,
  })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @ApiProperty({
    description: 'Filter posts by credential ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  credentialId?: string;

  @ApiProperty({
    description: 'Filter posts by Publish content campaign ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  campaignId?: string;
}
