import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class NewsletterAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({
    description: 'Range start (ISO). Default: 30 days ago.',
  })
  readonly from?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Range end (ISO). Default: now.' })
  readonly to?: string;
}
