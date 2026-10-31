import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FontFamiliesQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Search font families by label, key or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
