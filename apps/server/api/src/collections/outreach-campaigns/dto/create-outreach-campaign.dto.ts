import { OutreachCampaignAiConfigDto } from '@api/collections/outreach-campaigns/dto/outreach-campaign-ai-config.dto';
import { OutreachCampaignDiscoveryConfigDto } from '@api/collections/outreach-campaigns/dto/outreach-campaign-discovery-config.dto';
import { OutreachCampaignDmConfigDto } from '@api/collections/outreach-campaigns/dto/outreach-campaign-dm-config.dto';
import { OutreachCampaignRateLimitsDto } from '@api/collections/outreach-campaigns/dto/outreach-campaign-rate-limits.dto';
import { OutreachCampaignScheduleDto } from '@api/collections/outreach-campaigns/dto/outreach-campaign-schedule.dto';
import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateOutreachCampaignDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Organization that owns this campaign',
    required: false,
  })
  organization?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Brand this campaign is scoped to',
    required: false,
  })
  brand?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'User that created this campaign',
    required: false,
  })
  user?: string;

  @IsMongoId()
  @ApiProperty({
    description: 'Credential to use for posting replies',
    required: true,
  })
  credential!: string;

  @IsString()
  @MaxLength(120)
  @ApiProperty({
    description: 'Name of the campaign',
    example: 'Product Launch Campaign',
  })
  label!: string;

  @IsString()
  @MaxLength(512)
  @IsOptional()
  @ApiProperty({
    description: 'Description of the campaign',
    required: false,
  })
  description?: string;

  @IsEnum(CampaignPlatform)
  @ApiProperty({
    description: 'Platform for the campaign',
    enum: CampaignPlatform,
    enumName: 'CampaignPlatform',
    example: CampaignPlatform.TWITTER,
  })
  platform!: CampaignPlatform;

  @IsEnum(CampaignType)
  @ApiProperty({
    description: 'Type of campaign',
    enum: CampaignType,
    enumName: 'CampaignType',
    example: CampaignType.MANUAL,
  })
  campaignType!: CampaignType;

  @ValidateNested()
  @Type(() => OutreachCampaignDiscoveryConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'Discovery configuration for AI-powered targeting',
    required: false,
    type: OutreachCampaignDiscoveryConfigDto,
  })
  discoveryConfig?: OutreachCampaignDiscoveryConfigDto;

  @ValidateNested()
  @Type(() => OutreachCampaignAiConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'AI configuration for reply generation',
    required: false,
    type: OutreachCampaignAiConfigDto,
  })
  aiConfig?: OutreachCampaignAiConfigDto;

  @ValidateNested()
  @Type(() => OutreachCampaignDmConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'DM configuration for DM outreach campaigns',
    required: false,
    type: OutreachCampaignDmConfigDto,
  })
  dmConfig?: OutreachCampaignDmConfigDto;

  @ValidateNested()
  @Type(() => OutreachCampaignRateLimitsDto)
  @IsOptional()
  @ApiProperty({
    description: 'Rate limit configuration',
    required: false,
    type: OutreachCampaignRateLimitsDto,
  })
  rateLimits?: OutreachCampaignRateLimitsDto;

  @ValidateNested()
  @Type(() => OutreachCampaignScheduleDto)
  @IsOptional()
  @ApiProperty({
    description: 'Schedule configuration',
    required: false,
    type: OutreachCampaignScheduleDto,
  })
  schedule?: OutreachCampaignScheduleDto;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether the campaign is active',
    required: false,
  })
  isActive?: boolean;
}
