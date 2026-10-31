import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class EditorProjectsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Case-insensitive search over the project name',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
