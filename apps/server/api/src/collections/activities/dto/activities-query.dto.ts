import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ActivitiesQueryDto extends BaseQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activeOnly?: boolean;

  @ApiProperty({
    description: 'Search activities by action, entity type or entity id',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
