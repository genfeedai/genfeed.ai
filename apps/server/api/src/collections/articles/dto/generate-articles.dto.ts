import { ArticleCategory } from '@genfeedai/enums';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum ArticleGenerationType {
  STANDARD = 'standard',
  X_ARTICLE = 'x-article',
}

export class GenerateArticlesDto {
  @IsString()
  @MaxLength(500)
  prompt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  count?: number;

  @IsOptional()
  @IsEnum(ArticleCategory)
  category?: ArticleCategory;

  @IsOptional()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsEnum(ArticleGenerationType)
  type?: ArticleGenerationType;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsInt()
  @Min(2500)
  @Max(10000)
  targetWordCount?: number;

  @IsOptional()
  @IsBoolean()
  generateHeaderImage?: boolean;

  @IsOptional()
  @IsBoolean()
  wait?: boolean; // If true, waits for generation to complete before returning
}

/**
 * Enhancement types for article editing
 * - 'edit': General editing (default) - uses ARTICLE_EDIT template
 * - 'seo': SEO optimization - uses ARTICLE_SEO template
 */
export type ArticleEnhanceType = 'edit' | 'seo';

export class EditArticleWithAIDto {
  @IsString()
  @MaxLength(500)
  prompt!: string; // e.g., "rephrase the first paragraph"

  @IsOptional()
  @IsString()
  enhanceType?: ArticleEnhanceType; // 'edit' (default) or 'seo'
}
