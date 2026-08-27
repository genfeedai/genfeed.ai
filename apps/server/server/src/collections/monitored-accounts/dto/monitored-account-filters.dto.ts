import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class KeywordFiltersDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Keywords to include (tweet must contain at least one)',
    example: ['AI', 'startup', 'tech'],
    required: false,
    type: [String],
  })
  include?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Keywords to exclude (tweet must not contain any)',
    example: ['spam', 'nsfw'],
    required: false,
    type: [String],
  })
  exclude?: string[];
}

export class HashtagFiltersDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Hashtags to include (without #)',
    example: ['AI', 'startup'],
    required: false,
    type: [String],
  })
  include?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Hashtags to exclude (without #)',
    required: false,
    type: [String],
  })
  exclude?: string[];
}

export class EngagementThresholdsDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Minimum retweets required',
    required: false,
  })
  minRetweets?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Minimum likes required',
    required: false,
  })
  minLikes?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Minimum replies required',
    required: false,
  })
  minReplies?: number;
}

export class MonitoredAccountFiltersDto {
  @ValidateNested()
  @Type(() => KeywordFiltersDto)
  @IsOptional()
  @ApiProperty({
    description: 'Keyword filters',
    required: false,
    type: KeywordFiltersDto,
  })
  keywords?: KeywordFiltersDto;

  @ValidateNested()
  @Type(() => HashtagFiltersDto)
  @IsOptional()
  @ApiProperty({
    description: 'Hashtag filters',
    required: false,
    type: HashtagFiltersDto,
  })
  hashtags?: HashtagFiltersDto;

  @IsEnum(['all', 'text-only', 'images', 'videos'])
  @IsOptional()
  @ApiProperty({
    default: 'all',
    description: 'Media type filter',
    enum: ['all', 'text-only', 'images', 'videos'],
    required: false,
  })
  mediaType?: string;

  @ValidateNested()
  @Type(() => EngagementThresholdsDto)
  @IsOptional()
  @ApiProperty({
    description: 'Minimum engagement thresholds',
    required: false,
    type: EngagementThresholdsDto,
  })
  minEngagement?: EngagementThresholdsDto;
}
