import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApiKeysQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by label (case-insensitive contains)',
    required: false,
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    description: 'Filter by description (case-insensitive contains)',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Combined label/description case-insensitive search',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
