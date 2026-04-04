import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class UTMDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  medium?: string;

  @IsOptional()
  @IsString()
  campaign?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  term?: string;
}

export class CreateTrackedLinkDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  contentId?: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  @IsOptional()
  @IsString()
  customSlug?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UTMDto)
  utm?: UTMDto;
}
