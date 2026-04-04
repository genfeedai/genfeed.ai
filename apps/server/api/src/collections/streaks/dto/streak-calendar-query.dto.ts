import { IsDateString, IsOptional } from 'class-validator';

export class StreakCalendarQueryDto {
  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;
}
