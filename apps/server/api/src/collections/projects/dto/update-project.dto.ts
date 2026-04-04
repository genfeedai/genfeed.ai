import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Soft delete flag',
    required: false,
    type: Boolean,
  })
  isDeleted?: boolean;
}
