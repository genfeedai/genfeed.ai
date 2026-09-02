import {
  GOAL_LEVELS,
  GOAL_STATUSES,
  type GoalLevel,
  type GoalStatus,
} from '@api/collections/goals/schemas/goal.schema';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class GoalQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: GOAL_STATUSES })
  @IsOptional()
  @IsEnum(GOAL_STATUSES)
  status?: GoalStatus;

  @ApiPropertyOptional({ description: 'Filter by level', enum: GOAL_LEVELS })
  @IsOptional()
  @IsEnum(GOAL_LEVELS)
  level?: GoalLevel;
}
