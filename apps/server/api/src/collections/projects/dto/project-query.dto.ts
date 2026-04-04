import { PROJECT_STATUSES } from '@api/collections/projects/schemas/project.schema';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class ProjectQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  @ApiProperty({
    description: 'Filter by project status',
    enum: PROJECT_STATUSES,
    required: false,
  })
  status?: (typeof PROJECT_STATUSES)[number];
}
