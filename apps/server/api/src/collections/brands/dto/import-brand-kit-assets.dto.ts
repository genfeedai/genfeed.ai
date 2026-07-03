import type {
  BrandKitAssetRole,
  BrandKitSourceType,
  IBrandKitAssetImportCandidate,
  IBrandKitAssetImportRequest,
} from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const BRAND_KIT_ASSET_ROLES: readonly BrandKitAssetRole[] = [
  'logo',
  'banner',
  'reference',
];

const BRAND_KIT_SOURCE_TYPES: readonly BrandKitSourceType[] = [
  'current_brand',
  'website',
  'manual',
  'uploaded_guidance',
  'system',
];

export class ImportBrandKitAssetCandidateDto
  implements IBrandKitAssetImportCandidate
{
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  readonly candidateId?: string;

  @ApiProperty({ enum: BRAND_KIT_ASSET_ROLES })
  @IsIn(BRAND_KIT_ASSET_ROLES)
  readonly role!: BrandKitAssetRole;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  readonly url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  readonly sourceUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  readonly label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  readonly mimeType?: string;

  @ApiProperty({ enum: BRAND_KIT_SOURCE_TYPES, required: false })
  @IsIn(BRAND_KIT_SOURCE_TYPES)
  @IsOptional()
  readonly sourceType?: BrandKitSourceType;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  readonly replaceExisting?: boolean;
}

export class ImportBrandKitAssetsDto implements IBrandKitAssetImportRequest {
  @ApiProperty({ type: [ImportBrandKitAssetCandidateDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @Type(() => ImportBrandKitAssetCandidateDto)
  @ValidateNested({ each: true })
  readonly assets!: ImportBrandKitAssetCandidateDto[];
}
