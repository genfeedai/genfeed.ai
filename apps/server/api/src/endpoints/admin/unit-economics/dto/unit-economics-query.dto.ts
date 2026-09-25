import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class UnitEconomicsQueryDto {
  @ApiProperty({
    description: 'Inclusive period start date or timestamp',
    example: '2026-09-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    description: 'Inclusive period end date or timestamp',
    example: '2026-09-30',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    description: 'Drill into one organization, grouped by user',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  organizationId?: string;
}
