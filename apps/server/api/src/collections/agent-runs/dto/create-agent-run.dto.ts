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
import type { Types } from 'mongoose';

export class CreateAgentRunDto {
  @ApiProperty()
  @IsMongoId()
  organization!: Types.ObjectId;

  @ApiProperty()
  @IsMongoId()
  user!: Types.ObjectId;

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
  strategy?: Types.ObjectId;

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
