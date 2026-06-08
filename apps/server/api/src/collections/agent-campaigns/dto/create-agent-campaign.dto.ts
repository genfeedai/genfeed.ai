import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
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

export class ContentRotationTargetDto {
  @IsString()
  @ApiProperty({ description: 'Stable target key', required: true })
  key!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Human-readable target label', required: false })
  label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Optional platform scope', required: false })
  platform?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Optional strategy scope', required: false })
  strategyId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Optional topic bucket scope', required: false })
  topic?: string;

  @IsNumber()
  @Min(0)
  @ApiProperty({ description: 'Target share weight', required: true })
  weight!: number;
}

export class ContentRotationConfigDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether weighted content rotation is enabled',
    required: false,
  })
  enabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @ApiProperty({
    description: 'Recent run lookback window in days',
    required: false,
  })
  lookbackDays?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentRotationTargetDto)
  @IsOptional()
  @ApiProperty({
    description: 'Campaign/topic/platform target weights',
    required: false,
    type: [ContentRotationTargetDto],
  })
  targets?: ContentRotationTargetDto[];
}

export class CreateAgentCampaignDto {
  @IsString()
  @ApiProperty({ description: 'Campaign label', required: true })
  label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Campaign brief / description', required: false })
  brief?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ description: 'Brand ID', required: false })
  brand?: string;

  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Agent strategy IDs included in this campaign',
    required: false,
  })
  agents?: string[];

  @IsEntityId()
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

  @ValidateNested()
  @Type(() => ContentRotationConfigDto)
  @IsOptional()
  @ApiProperty({
    description: 'Weighted campaign/topic rotation rules',
    required: false,
    type: ContentRotationConfigDto,
  })
  contentRotation?: ContentRotationConfigDto;

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
