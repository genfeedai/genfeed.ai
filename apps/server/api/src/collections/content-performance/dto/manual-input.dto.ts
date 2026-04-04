import { ContentType, CredentialPlatform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualMetricEntryDto {
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
  @IsMongoId()
  post?: string;

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
}

export class ManualInputDto {
  @ApiProperty({ description: 'Brand ID', required: true })
  @IsMongoId()
  brand!: string;

  @ApiProperty({
    description: 'Array of metric entries',
    type: [ManualMetricEntryDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualMetricEntryDto)
  entries!: ManualMetricEntryDto[];
}
