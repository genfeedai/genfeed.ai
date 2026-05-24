import {
  GOAL_LEVELS,
  GOAL_STATUSES,
  type GoalLevel,
  type GoalStatus,
} from '@api/collections/goals/schemas/goal.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGoalDto {
  @ApiProperty({ description: 'Goal title', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({ description: 'Goal description', maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Goal status',
    enum: GOAL_STATUSES,
  })
  @IsOptional()
  @IsEnum(GOAL_STATUSES)
  status?: GoalStatus;

  @ApiPropertyOptional({
    description: 'Goal level',
    enum: GOAL_LEVELS,
  })
  @IsOptional()
  @IsEnum(GOAL_LEVELS)
  level?: GoalLevel;

  @ApiPropertyOptional({ description: 'Parent goal ID' })
  @IsOptional()
  @IsEntityId()
  parentId?: string;
}
