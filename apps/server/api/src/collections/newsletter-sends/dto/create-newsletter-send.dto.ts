import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class CreateNewsletterSendDto {
  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({
    description: 'ISO send time. Omit to send now.',
  })
  readonly scheduledFor?: string;
}
