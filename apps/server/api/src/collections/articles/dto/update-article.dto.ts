import type { ViralityAnalysis } from '@api/collections/articles/dto/analyze-virality.dto';
import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
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
      'Restore the article content from a prior version (prompt) id. When set, the article is reverted to that version and other update fields are ignored.',
    required: false,
  })
  @IsOptional()
  @IsString()
  restoreFromVersionId?: string;
}
