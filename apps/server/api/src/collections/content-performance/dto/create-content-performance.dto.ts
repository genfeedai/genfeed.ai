import { PerformanceSource } from '@api/collections/content-performance/schemas/content-performance.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ContentType, CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateContentPerformanceDto {
  @ApiProperty({ description: 'Brand ID', required: true })
  @IsEntityId()
  brand!: string;

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

  @ApiProperty({
    description: 'Date when metrics were measured',
    required: true,
  })
  @IsDateString()
  measuredAt!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  post?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalPostId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  generationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEntityId()
  workflowExecutionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  promptUsed?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hookUsed?: string;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  views?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  likes?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  comments?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  shares?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  saves?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  clicks?: number;

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  revenue?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  engagementRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  performanceScore?: number;

  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cycleNumber?: number;

  @ApiProperty({
    enum: PerformanceSource,
    enumName: 'PerformanceSource',
    required: false,
  })
  @IsOptional()
  @IsEnum(PerformanceSource)
  source?: PerformanceSource;
}
