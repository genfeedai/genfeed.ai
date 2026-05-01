import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class ArticlesQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Search articles by title or content',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description:
      'Filter articles by status using repeated query keys (e.g., ?status=draft&status=published).',
    enum: ArticleStatus,
    enumName: 'ArticleStatus',
    isArray: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ArticleStatus, { each: true })
  status?: ArticleStatus[];

  @ApiProperty({
    description: 'Filter articles by category',
    enum: ArticleCategory,
    enumName: 'ArticleCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(ArticleCategory)
  category?: ArticleCategory;

  @ApiProperty({
    description: 'Filter articles by tag ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  tag?: string;

  @ApiProperty({
    description: 'Filter articles by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;

  @ApiProperty({
    description: 'Filter articles by access scope',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Field to sort by',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({
    description: 'Sort order (ascending or descending)',
    enum: ['asc', 'desc'],
    required: false,
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
