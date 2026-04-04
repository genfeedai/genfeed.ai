import { AnalyticsMetric } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum LeaderboardSort {
  ENGAGEMENT = 'engagement',
  VIEWS = 'views',
  POSTS = 'posts',
}

export class AnalyticsDateRangeDto {
  @ApiProperty({
    description:
      'Start date for analytics (YYYY-MM-DD). Defaults to 30 days before endDate.',
    example: '2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date for analytics (YYYY-MM-DD). Defaults to yesterday.',
    example: '2024-01-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Brand ID to filter analytics by',
    required: false,
  })
  @IsOptional()
  @IsString()
  brand?: string;
}

export class LeaderboardQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    default: 'engagement',
    description: 'Sort field for leaderboard',
    enum: LeaderboardSort,
    enumName: 'LeaderboardSort',
    required: false,
  })
  @IsOptional()
  @IsEnum(LeaderboardSort)
  sort?: LeaderboardSort = LeaderboardSort.ENGAGEMENT;

  @ApiProperty({
    default: 10,
    description: 'Number of results to return',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class AdminOrgsQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    default: 20,
    description: 'Number of results per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    default: 'engagement',
    description: 'Sort field',
    enum: LeaderboardSort,
    enumName: 'LeaderboardSort',
    required: false,
  })
  @IsOptional()
  @IsEnum(LeaderboardSort)
  sort?: LeaderboardSort = LeaderboardSort.ENGAGEMENT;
}

export class AdminBrandsQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    default: 1,
    description: 'Page number for pagination',
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    default: 20,
    description: 'Number of results per page',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    default: 'engagement',
    description: 'Sort field',
    enum: LeaderboardSort,
    enumName: 'LeaderboardSort',
    required: false,
  })
  @IsOptional()
  @IsEnum(LeaderboardSort)
  sort?: LeaderboardSort = LeaderboardSort.ENGAGEMENT;
}

export class AnalyticsFilterQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    description: 'Brand ID to filter by',
    required: false,
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({
    description: 'Platform to filter by',
    required: false,
  })
  @IsOptional()
  @IsString()
  platform?: string;
}

export class TopContentQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    default: 10,
    description: 'Number of results to return',
    maximum: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    default: AnalyticsMetric.VIEWS,
    description: 'Metric to sort by',
    enum: [
      AnalyticsMetric.VIEWS,
      AnalyticsMetric.ENGAGEMENT,
      AnalyticsMetric.LIKES,
    ],
    required: false,
  })
  @IsOptional()
  @IsEnum(AnalyticsMetric)
  metric?:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES = AnalyticsMetric.VIEWS;

  @ApiProperty({
    description: 'Brand ID to filter by',
    required: false,
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({
    description: 'Platform to filter by',
    required: false,
  })
  @IsOptional()
  @IsString()
  platform?: string;
}

export class GrowthQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    default: AnalyticsMetric.VIEWS,
    description: 'Metric to track growth for',
    enum: [
      AnalyticsMetric.VIEWS,
      AnalyticsMetric.ENGAGEMENT,
      AnalyticsMetric.POSTS,
    ],
    required: false,
  })
  @IsOptional()
  @IsEnum(AnalyticsMetric)
  metric?:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.POSTS = AnalyticsMetric.VIEWS;

  // brand is inherited from AnalyticsDateRangeDto
}

export class ViralHooksQueryDto extends AnalyticsDateRangeDto {
  @ApiProperty({
    description: 'Brand ID to filter by',
    required: false,
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({
    description: 'Organization ID to filter by',
    required: false,
  })
  @IsOptional()
  @IsString()
  organization?: string;
}
