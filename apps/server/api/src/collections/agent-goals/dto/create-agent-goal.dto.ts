import {
  AGENT_GOAL_METRICS,
  type AgentGoalMetric,
} from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateAgentGoalDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ description: 'Organization ID', required: false })
  organization?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ description: 'User ID', required: false })
  user?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ description: 'Brand ID', required: false })
  brand?: string;

  @IsString()
  @ApiProperty({ description: 'Goal label' })
  label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Optional goal description', required: false })
  description?: string;

  @IsEnum(AGENT_GOAL_METRICS)
  @ApiProperty({ enum: AGENT_GOAL_METRICS })
  metric!: AgentGoalMetric;

  @IsNumber()
  @Min(0)
  @ApiProperty({ description: 'Target metric value' })
  targetValue!: number;

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
