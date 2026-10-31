import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ScenesQueryDto extends BaseQueryDto {
  @ApiProperty({
    description:
      'Case-insensitive search over the scene label, key and description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
