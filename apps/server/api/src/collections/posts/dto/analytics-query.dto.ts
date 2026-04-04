import { AnalyticsMetric } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AnalyticsQueryDto {
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
    description:
      'End date for analytics (YYYY-MM-DD). Max = yesterday (D-1). Defaults to yesterday.',
    example: '2024-01-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Account ID to filter analytics',
    required: false,
  })
  @IsOptional()
  @IsString()
  brandId?: string;
}

export class TimeSeriesQueryDto {
  @ApiProperty({
    description:
      'Start date for time series (YYYY-MM-DD). Defaults to D-7 (7 days ago).',
    example: '2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description:
      'End date for time series (YYYY-MM-DD). Max = yesterday (D-1). Defaults to yesterday.',
    example: '2024-01-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Account ID to filter analytics',
    required: false,
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({
    default: 'day',
    description: 'Grouping for time series data',
    enum: ['day', 'week'],
    required: false,
  })
  @IsOptional()
  @IsEnum(['day', 'week'])
  groupBy?: 'day' | 'week' = 'day';
}

export class TopContentQueryDto {
  @ApiProperty({
    default: 10,
    description: 'Number of top content items to return',
    maximum: 50,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiProperty({
    default: AnalyticsMetric.VIEWS,
    description: 'Metric to rank content by',
    enum: [AnalyticsMetric.VIEWS, AnalyticsMetric.ENGAGEMENT],
    required: false,
  })
  @IsOptional()
  @IsEnum(AnalyticsMetric)
  metric?: AnalyticsMetric.VIEWS | AnalyticsMetric.ENGAGEMENT =
    AnalyticsMetric.VIEWS;

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
    description:
      'End date for analytics (YYYY-MM-DD). Max = yesterday (D-1). Defaults to yesterday.',
    example: '2024-01-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Account ID to filter analytics',
    required: false,
  })
  @IsOptional()
  @IsString()
  brandId?: string;
}
