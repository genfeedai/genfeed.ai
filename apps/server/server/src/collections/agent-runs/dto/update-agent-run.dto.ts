import { AgentExecutionStatus } from '@genfeedai/enums';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateAgentRunDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(AgentExecutionStatus)
  status?: AgentExecutionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditBudget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  artifactReferences?: AgentArtifactReference[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artifactVersionPinIds?: string[];

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
