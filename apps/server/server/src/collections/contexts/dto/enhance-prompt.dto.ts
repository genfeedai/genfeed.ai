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
