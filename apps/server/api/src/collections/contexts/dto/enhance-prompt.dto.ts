import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class EnhancePromptDto {
  @IsString()
  prompt!: string;

  @IsEnum(['image', 'video', 'caption', 'article', 'script'])
  contentType!: 'image' | 'video' | 'caption' | 'article' | 'script';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextBaseIds?: string[]; // Specific context bases to use

  /**
   * Active brand. Retrieval only reads bases owned by this brand plus
   * organization-wide bases; without it only organization-wide bases are read.
   */
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @IsOptional()
  @IsBoolean()
  useBrandVoice?: boolean; // Use brand voice context

  @IsOptional()
  @IsBoolean()
  useContentLibrary?: boolean; // Use content library context

  @IsOptional()
  @IsBoolean()
  useAudience?: boolean; // Use audience context

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxResults?: number; // How many relevant entries to retrieve (default: 5)
}
