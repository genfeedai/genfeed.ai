import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ContentQuotaConfigDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiProperty({ description: 'Number of posts quota', required: false })
  posts?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiProperty({ description: 'Number of images quota', required: false })
  images?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiProperty({ description: 'Number of videos quota', required: false })
  videos?: number;
}

export class CreateAgentCampaignDto {
  @IsString()
  @ApiProperty({ description: 'Campaign label', required: true })
  label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Campaign brief / description', required: false })
  brief?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ description: 'Brand ID', required: false })
  brand?: string;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Agent strategy IDs included in this campaign',
    required: false,
  })
  agents?: string[];

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Optional presentation-only lead strategy ID',
    required: false,
  })
  campaignLeadStrategyId?: string;

  @IsDate()
  @Type(() => Date)
  @ApiProperty({ description: 'Campaign start date', required: true })
  startDate!: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Campaign end date', required: false })
  endDate?: Date;

  @IsEnum(['draft', 'active', 'paused', 'completed'])
  @IsOptional()
  @ApiProperty({
    description: 'Campaign status',
    enum: ['draft', 'active', 'paused', 'completed'],
    required: false,
  })
  status?: 'draft' | 'active' | 'paused' | 'completed';

  @ValidateNested()
  @Type(() => ContentQuotaConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'Content production quotas',
    required: false,
    type: ContentQuotaConfigDto,
  })
  contentQuota?: ContentQuotaConfigDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiProperty({
    description: 'Credits allocated to this campaign',
    required: false,
  })
  creditsAllocated?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether campaign orchestration is enabled',
    required: false,
  })
  orchestrationEnabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @ApiProperty({
    description: 'Campaign orchestration cadence in hours',
    required: false,
  })
  orchestrationIntervalHours?: number;
}
