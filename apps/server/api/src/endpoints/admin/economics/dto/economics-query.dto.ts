import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class EconomicsQueryDto {
  @ApiProperty({
    description: 'Inclusive period start date or timestamp (UTC day)',
    example: '2026-09-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    description: 'Inclusive period end date or timestamp (UTC day)',
    example: '2026-09-30',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
