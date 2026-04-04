import { CreateGoalDto } from '@api/collections/goals/dto/create-goal.dto';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGoalDto extends PartialType(CreateGoalDto) {
  @ApiPropertyOptional({ description: 'Soft delete flag' })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
