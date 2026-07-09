import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentExecutionTrigger } from '@genfeedai/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateAgentRunDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  user?: string;

  @ApiProperty()
  @IsEnum(AgentExecutionTrigger)
  trigger!: AgentExecutionTrigger;

  @ApiProperty()
  @IsString()
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  strategy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditBudget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  steps?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  toolCalls?: Record<string, unknown>[];
}
