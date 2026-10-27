import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class XGrowthReportQueryDto {
  @ApiProperty({ description: 'Brand the account is connected to' })
  @IsEntityId()
  brandId!: string;

  @ApiProperty({
    description: 'First day of the report period (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: 'Last day of the report period, included (YYYY-MM-DD)',
    example: '2026-10-07',
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({
    description: 'Organization ID; customers may only name their own.',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  organizationId?: string;
}
