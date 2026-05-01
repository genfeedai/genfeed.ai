import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  BookmarkCategory,
  BookmarkIntent,
  BookmarkPlatform,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateBookmarkDto {
  @ApiProperty({
    description: 'Folder ID to organize the bookmark',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  folder?: string;

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
    description: 'Brand ID associated with the bookmark',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;

  @ApiProperty({
    description: 'Category of bookmark',
    enum: BookmarkCategory,
    enumName: 'BookmarkCategory',
  })
  @IsEnum(BookmarkCategory)
  category!: BookmarkCategory;

  @ApiProperty({
    description: 'URL of the bookmarked content',
  })
  @IsUrl()
  url!: string;

  @ApiProperty({
    description: 'Social media platform',
    enum: BookmarkPlatform,
    enumName: 'BookmarkPlatform',
  })
  @IsEnum(BookmarkPlatform)
  platform!: BookmarkPlatform;

  @ApiProperty({
    description: 'Title of the bookmarked content',
    maxLength: 500,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiProperty({
    description: 'Main content or text',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  content!: string;

  @ApiProperty({
    description: 'Description of the bookmarked content',
    maxLength: 2000,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    description: 'Author name',
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @ApiProperty({
    description: 'Author handle or username',
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  authorHandle?: string;

  @ApiProperty({
    description: 'URL of the thumbnail image',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiProperty({
    description: 'Array of media URLs (images, videos, etc.)',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  mediaUrls?: string[];

  @ApiProperty({
    description: 'Platform-specific data (engagement metrics, IDs, etc.)',
    required: false,
  })
  @IsOptional()
  @IsObject()
  platformData?: {
    tweetId?: string;
    engagement?: {
      likes?: number;
      retweets?: number;
      replies?: number;
    };
    videoId?: string;
    duration?: number;
    channelId?: string;
    metadata?: Record<string, unknown>;
  };

  @ApiProperty({
    description: 'Intent for saving this bookmark',
    enum: BookmarkIntent,
    enumName: 'BookmarkIntent',
    required: false,
  })
  @IsEnum(BookmarkIntent)
  @IsOptional()
  intent?: BookmarkIntent;
}
