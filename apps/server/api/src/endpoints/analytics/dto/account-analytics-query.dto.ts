import { AnalyticsDateRangeDto } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  AccountEvaluationState,
  AnalyticsMetric,
  Platform,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AccountAnalyticsQueryDto extends AnalyticsDateRangeDto {
  @IsOptional()
  @IsEnum(Platform)
  @ApiProperty({ enum: Platform, required: false })
  platform?: Platform;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  search?: string;

  @IsOptional()
  @IsIn(['connected', 'disconnected', 'all'])
  @ApiProperty({ required: false })
  status?: 'connected' | 'disconnected' | 'all';

  @IsOptional()
  @IsEnum(AnalyticsMetric)
  @ApiProperty({ enum: AnalyticsMetric, required: false })
  metric?: AnalyticsMetric;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiProperty({ required: false })
  direction?: 'asc' | 'desc';

  @IsOptional()
  @IsEnum(AccountEvaluationState)
  @ApiProperty({ enum: AccountEvaluationState, required: false })
  evaluationState?: AccountEvaluationState;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class AccountAnalyticsTopQueryDto extends AnalyticsDateRangeDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(AnalyticsMetric)
  metric?: AnalyticsMetric = AnalyticsMetric.VIEWS;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number = 5;
}

export class FleetEvaluationPolicyDto {
  @IsBoolean()
  isEnabled!: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(52)
  windowWeeks!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPublishedPosts!: number;

  @IsEnum(AnalyticsMetric)
  metric!: AnalyticsMetric;

  @Type(() => Number)
  @IsNumber()
  healthyMin!: number;

  @Type(() => Number)
  @IsNumber()
  watchMin!: number;

  @IsOptional()
  @IsEntityId()
  brandId?: string;
}
