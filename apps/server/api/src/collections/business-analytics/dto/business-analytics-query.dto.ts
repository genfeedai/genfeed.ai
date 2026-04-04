import { IsOptional, IsString } from 'class-validator';

export class BusinessAnalyticsQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
