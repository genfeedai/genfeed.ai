import {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PatternsQueryDto {
  @IsOptional()
  @IsEnum(ContentIntelligencePlatform)
  @ApiProperty({
    description: 'Filter by platform',
    enum: ContentIntelligencePlatform,
    enumName: 'ContentIntelligencePlatform',
    required: false,
  })
  platform?: ContentIntelligencePlatform;

  @IsOptional()
  @IsEnum(ContentPatternType)
  @ApiProperty({
    description: 'Filter by pattern type',
    enum: ContentPatternType,
    enumName: 'ContentPatternType',
    required: false,
  })
  patternType?: ContentPatternType;

  @IsOptional()
  @IsEnum(TemplateCategory)
  @ApiProperty({
    description: 'Filter by template category',
    enum: TemplateCategory,
    enumName: 'TemplateCategory',
    required: false,
  })
  templateCategory?: TemplateCategory;

  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Filter by source creator',
    required: false,
  })
  sourceCreator?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Filter by tags',
    required: false,
    type: [String],
  })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({
    description: 'Minimum relevance weight',
    maximum: 1,
    minimum: 0,
    required: false,
  })
  minRelevanceWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({
    description: 'Minimum engagement rate from source',
    minimum: 0,
    required: false,
  })
  minEngagementRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({
    default: 20,
    description: 'Number of results per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    default: 1,
    description: 'Page number',
    minimum: 1,
    required: false,
  })
  page?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Sort field',
    required: false,
  })
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  @ApiProperty({
    default: 'desc',
    description: 'Sort order',
    enum: ['asc', 'desc'],
    required: false,
  })
  sortOrder?: 'asc' | 'desc';
}

export class CreatorsQueryDto {
  @IsOptional()
  @IsEnum(ContentIntelligencePlatform)
  @ApiProperty({
    description: 'Filter by platform',
    enum: ContentIntelligencePlatform,
    enumName: 'ContentIntelligencePlatform',
    required: false,
  })
  platform?: ContentIntelligencePlatform;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Filter by niche',
    required: false,
  })
  niche?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Filter by tags',
    required: false,
    type: [String],
  })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({
    default: 20,
    description: 'Number of results per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    default: 1,
    description: 'Page number',
    minimum: 1,
    required: false,
  })
  page?: number;
}
