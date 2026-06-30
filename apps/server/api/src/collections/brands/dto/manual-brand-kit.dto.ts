import type { BrandKitAssetRole } from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ManualBrandKitAssetDto {
  @IsIn(['logo', 'banner', 'reference'])
  @ApiProperty({
    description: 'Brand kit role for this already-uploaded or attached asset.',
    enum: ['logo', 'banner', 'reference'],
  })
  role!: BrandKitAssetRole;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ required: false })
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({ required: false })
  label?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  @ApiProperty({ required: false })
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiProperty({ required: false })
  mimeType?: string;
}

export class ManualBrandKitDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fontFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  guidanceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  guidanceDocumentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  voiceTone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  voiceStyle?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  voiceAudience?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  voiceValues?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  voiceMessagingPillars?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  voiceDoNotSoundLike?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  voiceSampleOutput?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  strategyContentTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  strategyPlatforms?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  strategyGoals?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  strategyFrequency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ManualBrandKitAssetDto)
  assets?: ManualBrandKitAssetDto[];
}
