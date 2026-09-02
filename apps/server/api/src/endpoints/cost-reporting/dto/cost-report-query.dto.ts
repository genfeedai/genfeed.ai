import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CostReportQueryDto {
  @ApiProperty({
    description: 'Inclusive report start date or timestamp',
    example: '2026-08-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({
    description: 'Inclusive report end date or timestamp',
    example: '2026-08-26',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    description: 'Brand ID owned by the authenticated organization',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;
}

export class CostReportEntriesQueryDto extends CostReportQueryDto {
  @ApiProperty({ default: 50, maximum: 200, minimum: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiProperty({ default: 0, minimum: 0, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;
}
