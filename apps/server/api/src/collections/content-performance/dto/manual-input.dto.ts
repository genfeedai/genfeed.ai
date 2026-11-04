import { ContentPerformanceCountsDto } from '@api/collections/content-performance/dto/content-performance-counts.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ContentType, CredentialPlatform } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Manual entry is a hand-keyed / screenshot-transcribed flow, so it stays at
 * interactive scale. Every entry becomes one `create` in a `Promise.all`
 * fan-out (content-performance.service.ts `bulkManualImport`).
 */
const MAX_MANUAL_ENTRIES = 50;

export class ManualMetricEntryDto extends ContentPerformanceCountsDto {
  @ApiProperty({
    description: 'Platform',
    enum: CredentialPlatform,
    required: true,
  })
  @IsEnum(CredentialPlatform)
  platform!: CredentialPlatform;

  @ApiProperty({
    description: 'Content type',
    enum: ContentType,
    required: true,
  })
  @IsEnum(ContentType)
  contentType!: ContentType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalPostId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  postId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  generationId?: string;

  @ApiProperty({ required: true })
  @IsDateString()
  measuredAt!: string;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  clicks?: number;
}

export class ManualInputDto {
  @ApiProperty({ description: 'Brand ID', required: true })
  @IsEntityId()
  brandId!: string;

  @ApiProperty({
    description: 'Array of metric entries',
    maxItems: MAX_MANUAL_ENTRIES,
    type: [ManualMetricEntryDto],
  })
  @IsArray()
  @ArrayMaxSize(MAX_MANUAL_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => ManualMetricEntryDto)
  entries!: ManualMetricEntryDto[];
}
