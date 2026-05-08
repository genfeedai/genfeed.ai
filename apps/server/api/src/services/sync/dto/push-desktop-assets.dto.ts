import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DesktopAssetDto {
  @IsString()
  id!: string;

  @IsString()
  @IsOptional()
  brandId?: string;

  @IsString()
  createdAt!: string;

  @IsString()
  displayName!: string;

  @IsString()
  @IsIn(['image', 'video', 'audio', 'document'])
  kind!: string;

  @IsString()
  mimeType!: string;

  @IsString()
  organizationId!: string;

  @IsString()
  @IsIn(['cloud-generation', 'local-generation', 'local-import'])
  origin!: string;

  @IsString()
  @IsOptional()
  originalFileName?: string;

  @IsString()
  @IsIn([
    'cloud-only',
    'local-only',
    'missing-local',
    'synced',
    'upload-pending',
  ])
  residency!: string;

  @IsString()
  sha256!: string;

  @IsInt()
  @Type(() => Number)
  sizeBytes!: number;

  @IsString()
  updatedAt!: string;

  @IsString()
  @IsIn(['full', 'metadata-only', 'never'])
  uploadPolicy!: string;

  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class PushDesktopAssetsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesktopAssetDto)
  assets!: DesktopAssetDto[];
}
