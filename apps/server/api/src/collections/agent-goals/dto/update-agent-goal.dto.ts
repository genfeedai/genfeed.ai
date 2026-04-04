import {
  AGENT_GOAL_METRICS,
  type AgentGoalMetric,
} from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateAgentGoalDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Goal label', required: false })
  label?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Goal description', required: false })
  description?: string;

  @IsEnum(AGENT_GOAL_METRICS)
  @IsOptional()
  @ApiProperty({ enum: AGENT_GOAL_METRICS, required: false })
  metric?: AgentGoalMetric;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({ description: 'Target metric value', required: false })
  targetValue?: number;

  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Optional start date', required: false })
  startDate?: Date;

  @Type(() => Date)
  @IsOptional()
  @ApiProperty({ description: 'Optional end date', required: false })
  endDate?: Date;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ description: 'Whether the goal is active', required: false })
  isActive?: boolean;
}
