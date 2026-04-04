import { Platform, Timeframe } from '@genfeedai/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * DTO for fetching trends with options
 */
export class GetTrendsDto {
  @ApiPropertyOptional({
    default: 20,
    description: 'Maximum number of trends to return',
    maximum: 100,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    default: 'US',
    description: 'Region/country code for trends',
  })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({
    default: Timeframe.H24,
    description: 'Timeframe for trends',
    enum: [
      Timeframe.H1,
      Timeframe.H6,
      Timeframe.H12,
      Timeframe.H24,
      Timeframe.D7,
    ],
  })
  @IsOptional()
  @IsEnum([
    Timeframe.H1,
    Timeframe.H6,
    Timeframe.H12,
    Timeframe.H24,
    Timeframe.D7,
  ])
  timeframe?: Timeframe;
}

/**
 * DTO for fetching viral videos
 */
export class GetViralVideosDto {
  @ApiPropertyOptional({
    description: 'Platform to filter videos by',
    enum: Platform,
    enumName: 'Platform',
  })
  @IsOptional()
  @IsString()
  platform?: Platform;

  @ApiPropertyOptional({
    default: 50,
    description: 'Maximum number of videos to return',
    maximum: 100,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    default: Timeframe.H24,
    description: 'Timeframe for leaderboard',
    enum: [Timeframe.H24, Timeframe.H72, Timeframe.D7],
  })
  @IsOptional()
  @IsEnum([Timeframe.H24, Timeframe.H72, Timeframe.D7])
  timeframe?: Timeframe.H24 | Timeframe.H72 | Timeframe.D7;
}

/**
 * DTO for fetching trending hashtags
 */
export class GetTrendingHashtagsDto {
  @ApiPropertyOptional({
    description: 'Platform to filter hashtags by',
    enum: Platform,
    enumName: 'Platform',
  })
  @IsOptional()
  @IsString()
  platform?: Platform;

  @ApiPropertyOptional({
    default: 50,
    description: 'Maximum number of hashtags to return',
    maximum: 100,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * DTO for fetching trending sounds
 */
export class GetTrendingSoundsDto {
  @ApiPropertyOptional({
    default: 50,
    description: 'Maximum number of sounds to return',
    maximum: 100,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Response DTO for trend data
 */
export class TrendResponseDto {
  @ApiProperty({ description: 'Trend topic or hashtag' })
  topic!: string;

  @ApiProperty({ description: 'Platform this trend is from' })
  platform!: string;

  @ApiProperty({ description: 'Number of mentions or posts' })
  mentions!: number;

  @ApiProperty({ description: 'Growth rate percentage (0-100)' })
  growthRate!: number;

  @ApiProperty({ description: 'Virality score (0-100)' })
  viralityScore!: number;

  @ApiProperty({ description: 'Additional metadata' })
  metadata!: Record<string, unknown>;
}

/**
 * Response DTO for viral video data
 */
export class ViralVideoResponseDto {
  @ApiProperty({ description: 'External video ID from platform' })
  externalId!: string;

  @ApiProperty({ description: 'Platform this video is from' })
  platform!: string;

  @ApiPropertyOptional({ description: 'Video title' })
  title?: string;

  @ApiProperty({ description: 'Creator handle/username' })
  creatorHandle!: string;

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: 'Video URL' })
  videoUrl?: string;

  @ApiProperty({ description: 'View count' })
  viewCount!: number;

  @ApiProperty({ description: 'Like count' })
  likeCount!: number;

  @ApiProperty({ description: 'Comment count' })
  commentCount!: number;

  @ApiProperty({ description: 'Share count' })
  shareCount!: number;

  @ApiProperty({ description: 'Engagement rate percentage' })
  engagementRate!: number;

  @ApiProperty({ description: 'Viral score (0-100)' })
  viralScore!: number;

  @ApiProperty({ description: 'Views per hour (velocity)' })
  velocity!: number;
}

/**
 * Response DTO for trending hashtag data
 */
export class TrendingHashtagResponseDto {
  @ApiProperty({ description: 'Platform this hashtag is from' })
  platform!: string;

  @ApiProperty({ description: 'Hashtag (without #)' })
  hashtag!: string;

  @ApiProperty({ description: 'Number of posts using this hashtag' })
  postCount!: number;

  @ApiProperty({ description: 'Total view count' })
  viewCount!: number;

  @ApiProperty({ description: 'Growth rate percentage' })
  growthRate!: number;

  @ApiProperty({ description: 'Virality score (0-100)' })
  viralityScore!: number;

  @ApiProperty({ description: 'Related hashtags', type: [String] })
  relatedHashtags!: string[];
}

/**
 * Response DTO for trending sound data
 */
export class TrendingSoundResponseDto {
  @ApiProperty({ description: 'Platform (usually TikTok)' })
  platform!: string;

  @ApiProperty({ description: 'Sound ID' })
  soundId!: string;

  @ApiProperty({ description: 'Sound name/title' })
  soundName!: string;

  @ApiPropertyOptional({ description: 'Author/artist name' })
  authorName?: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  coverUrl?: string;

  @ApiPropertyOptional({ description: 'Audio play URL' })
  playUrl?: string;

  @ApiProperty({ description: 'Number of videos using this sound' })
  usageCount!: number;

  @ApiProperty({ description: 'Growth rate percentage' })
  growthRate!: number;

  @ApiProperty({ description: 'Virality score (0-100)' })
  viralityScore!: number;
}
