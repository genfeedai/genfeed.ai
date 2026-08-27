import { TemplateCategory } from '@genfeedai/enums';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SuggestTemplatesDto {
  @IsOptional()
  @IsString()
  goal?: string; // e.g., "increase engagement", "promote product launch"

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory; // Unified category (replaces contentType)

  @IsOptional()
  @IsString()
  industry?: string; // e.g., "technology", "fitness"

  @IsOptional()
  @IsString()
  platform?: string; // e.g., "instagram", "linkedin"

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  limit?: number; // How many suggestions (default: 5)
}
