import type { ViralityAnalysis } from '@api/collections/articles/dto/analyze-virality.dto';
import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import {
  ARTICLE_ACCESS_LEVELS,
  ARTICLE_UNLOCK_MAX_PRICE,
  ARTICLE_UNLOCK_MIN_PRICE,
  type ArticleAccessLevel,
} from '@genfeedai/contracts/constants';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateArticleDto extends PartialType(CreateArticleDto) {
  @ApiProperty({
    description: 'Whether the key is marked as deleted',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;

  @ApiProperty({
    description: 'Virality analysis data',
    required: false,
  })
  @IsOptional()
  @IsObject()
  viralityAnalysis?: ViralityAnalysis;

  @ApiProperty({
    description: 'Generation prompt used for AI content creation',
    maxLength: 2000,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  generationPrompt?: string;

  @ApiProperty({
    description:
      'Live URL of the article when it was published outside Genfeed. Send null to clear it.',
    maxLength: 2048,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  externalUrl?: string | null;

  @ApiProperty({
    description:
      'Who reads the article in full (#9718): everyone, or only paying subscribers and readers who unlocked it. Everyone else sees a preview.',
    enum: ARTICLE_ACCESS_LEVELS,
    required: false,
  })
  @IsOptional()
  @IsIn(ARTICLE_ACCESS_LEVELS)
  accessLevel?: ArticleAccessLevel;

  @ApiProperty({
    description:
      'One-time unlock price in credits for a paid article. Send null for subscribers only.',
    maximum: ARTICLE_UNLOCK_MAX_PRICE,
    minimum: ARTICLE_UNLOCK_MIN_PRICE,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(ARTICLE_UNLOCK_MIN_PRICE)
  @Max(ARTICLE_UNLOCK_MAX_PRICE)
  unlockPriceCredits?: number | null;

  @ApiProperty({
    description:
      'Restore the article content from a prior version (prompt) id. When set, the article is reverted to that version and other update fields are ignored.',
    required: false,
  })
  @IsOptional()
  @IsString()
  restoreFromVersionId?: string;
}
