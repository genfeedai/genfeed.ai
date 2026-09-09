import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class EmailPerformanceQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive UTC cohort start; defaults to 30 days ago',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    description: 'Exclusive UTC cohort end; maximum range is 90 days',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
