import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export class OutreachCampaignsQueryDto {
  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Filter by organization',
    required: false,
  })
  organization?: string;

  @IsOptional()
  @IsEnum(CampaignPlatform)
  @ApiProperty({
    description: 'Filter by platform',
    enum: CampaignPlatform,
    enumName: 'CampaignPlatform',
    required: false,
  })
  platform?: CampaignPlatform;

  @IsOptional()
  @IsEnum(CampaignType)
  @ApiProperty({
    description: 'Filter by campaign type',
    enum: CampaignType,
    enumName: 'CampaignType',
    required: false,
  })
  campaignType?: CampaignType;

  @IsOptional()
  @IsEnum(CampaignStatus)
  @ApiProperty({
    description: 'Filter by status',
    enum: CampaignStatus,
    enumName: 'CampaignStatus',
    required: false,
  })
  status?: CampaignStatus;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Filter by active status',
    required: false,
  })
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Include deleted campaigns',
    required: false,
  })
  isDeleted?: boolean;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: '-createdAt',
    description: 'Sort field and direction',
    required: false,
  })
  sort?: string;
}
