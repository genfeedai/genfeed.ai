import { AgentExecutionStatus } from '@genfeedai/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
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
}
