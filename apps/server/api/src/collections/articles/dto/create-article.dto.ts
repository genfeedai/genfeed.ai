import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateArticleDto {
  @ApiProperty({
    description: 'Article title',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiProperty({
    description:
      'URL-friendly slug (lowercase letters, numbers, and hyphens only)',
    example: 'my-article-title',
  })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug!: string;

  @ApiProperty({
    description: 'Article summary',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  summary!: string;

  @ApiProperty({
    description: 'Full article content (markdown or HTML)',
    required: false,
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: 'Article category',
    enum: ArticleCategory,
    enumName: 'ArticleCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(ArticleCategory)
  category?: ArticleCategory;

  @ApiProperty({
    description: 'Article status',
    enum: ArticleStatus,
    enumName: 'ArticleStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiProperty({
    description: 'Array of tag IDs',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEntityId({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Banner image ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  banner?: string;

  @ApiProperty({
    description: 'Article access scope',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Publication date (ISO 8601 format)',
    example: '2025-10-16T12:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
