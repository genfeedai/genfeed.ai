import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ArticleCategory } from '@genfeedai/contracts';
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

  // Required in effect (#5219): every caller here (articles-operations
  // controller, agent-generation-gateway) already falls back to
  // `user.brandId` — the member's real currentBrandId invariant, the
  // sanctioned "app" resolution per #5219 — when this is omitted, so the DTO
  // itself stays optional rather than duplicating that fallback here.
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  count?: number;

  @IsOptional()
  @IsEnum(ArticleCategory)
  category?: ArticleCategory;

  @IsOptional()
  @IsEntityId()
  credential?: string;

  /**
   * Per-request text model for the generation step, e.g. the agent's
   * `agentPolicy.generationModelOverride`. Takes precedence over the org's
   * `defaultModel`; the review/update steps keep their own configured models.
   * Unknown keys are rejected with 400 rather than silently falling back,
   * because text billing resolves the key against the models table *after* the
   * provider call and would otherwise fail the request post-spend.
   */
  @IsOptional()
  @IsString()
  model?: string;

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
