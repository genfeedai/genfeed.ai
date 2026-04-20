import { MediaCategory, Platform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateSocialMediaPostDto {
  @IsMongoId()
  @ApiProperty({ required: true })
  readonly brand!: string;

  @IsEnum(Platform)
  @ApiProperty({ enum: Platform, enumName: 'Platform', required: true })
  readonly platform!: Platform;

  @IsEnum(MediaCategory)
  @ApiProperty({
    enum: MediaCategory,
    enumName: 'MediaCategory',
    required: true,
  })
  readonly mediaType!: MediaCategory;

  @IsString()
  @MaxLength(5000)
  @ApiProperty({ maxLength: 5000, required: true })
  readonly caption!: string;

  @IsUrl()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly mediaUrl?: string;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  readonly mediaUrls?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  readonly hashtags?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly coverImageUrl?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly platformSpecificOptions?: {
    // LinkedIn specific
    visibility?: 'PUBLIC' | 'CONNECTIONS';

    // Instagram specific
    shareToFeed?: boolean;
    taggedUsers?: string[];
    location?: {
      name: string;
      latitude: number;
      longitude: number;
    };

    // Facebook specific
    pageId?: string;
    pageAccessToken?: string;
    targetAudience?: string;

    // Common
    scheduledPublishTime?: string;
  };

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: false, required: false })
  readonly isDraft?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly thumbnailUrl?: string;
}

export class BulkSocialMediaPostDto {
  @IsArray()
  @ApiProperty({ required: true, type: [CreateSocialMediaPostDto] })
  readonly posts!: CreateSocialMediaPostDto[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: false, required: false })
  readonly publishImmediately?: boolean;
}
