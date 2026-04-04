import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Soft delete flag',
    required: false,
    type: Boolean,
  })
  isDeleted?: boolean;
}
