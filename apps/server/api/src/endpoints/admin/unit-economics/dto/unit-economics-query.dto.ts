import { PaginationQueryDto } from '@api/helpers/dto/pagination-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  UNIT_ECONOMICS_SORT_KEYS,
  type UnitEconomicsSortDirection,
  type UnitEconomicsSortKey,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UnitEconomicsQueryDto extends PaginationQueryDto {
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

  @ApiProperty({
    description:
      'Order the rows by this column in the database. Defaults to provider cost.',
    enum: UNIT_ECONOMICS_SORT_KEYS,
    required: false,
  })
  @IsOptional()
  @IsIn(UNIT_ECONOMICS_SORT_KEYS)
  sortKey?: UnitEconomicsSortKey;

  @ApiProperty({
    default: 'desc',
    description: 'Sort direction for sortKey',
    enum: ['asc', 'desc'],
    required: false,
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: UnitEconomicsSortDirection;
}
