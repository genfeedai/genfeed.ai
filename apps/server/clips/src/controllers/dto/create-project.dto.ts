import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

export class ClipProjectSettingsDto {
  @IsOptional()
  @IsNumber()
  minDuration?: number;

  @IsOptional()
  @IsNumber()
  maxDuration?: number;

  @IsOptional()
  @IsNumber()
  maxClips?: number;

  @IsOptional()
  @IsString()
  aspectRatio?: string;

  @IsOptional()
  @IsString()
  captionStyle?: string;

  @IsOptional()
  @IsBoolean()
  addCaptions?: boolean;
}

export class CreateProjectDto {
  @IsUrl({ require_tld: false })
  videoUrl!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClipProjectSettingsDto)
  settings?: ClipProjectSettingsDto;
}

export class RetryProjectDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}
