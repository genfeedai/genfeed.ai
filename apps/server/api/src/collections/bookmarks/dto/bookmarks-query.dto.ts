import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  BookmarkCategory,
  BookmarkIntent,
  BookmarkPlatform,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class BookmarksQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter bookmarks by category',
    enum: BookmarkCategory,
    enumName: 'BookmarkCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(BookmarkCategory)
  category?: BookmarkCategory;

  @ApiProperty({
    description: 'Filter bookmarks by platform',
    enum: BookmarkPlatform,
    enumName: 'BookmarkPlatform',
    required: false,
  })
  @IsOptional()
  @IsEnum(BookmarkPlatform)
  platform?: BookmarkPlatform;

  @ApiProperty({
    description: 'Filter bookmarks by intent',
    enum: BookmarkIntent,
    enumName: 'BookmarkIntent',
    required: false,
  })
  @IsOptional()
  @IsEnum(BookmarkIntent)
  intent?: BookmarkIntent;

  @ApiProperty({
    description: 'Search bookmarks by title or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter bookmarks by folder ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  folder?: string;

  @ApiProperty({
    description: 'Filter bookmarks by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;
}
