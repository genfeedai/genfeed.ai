import { AgentExecutionTrigger } from '@genfeedai/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateAgentRunDto {
  @ApiProperty()
  @IsMongoId()
  organization!: string;

  @ApiProperty()
  @IsMongoId()
  user!: string;

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
  @IsMongoId()
  strategy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditBudget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
