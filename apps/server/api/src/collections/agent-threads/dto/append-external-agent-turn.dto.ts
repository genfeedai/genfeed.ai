import {
  AGENT_EXTERNAL_RUNTIME_KEY_VALUES,
  AGENT_EXTERNAL_RUNTIME_SESSION_ID_PATTERN,
  type AgentExternalRuntimeKey,
} from '@genfeedai/contracts/constants';
import type {
  IAgentExternalTurnInput,
  IAgentExternalTurnToolCall,
  IAgentExternalTurnUsage,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_USER_MESSAGE_LENGTH = 100_000;
const MAX_ASSISTANT_MESSAGE_LENGTH = 200_000;
const MAX_TOOL_CALLS = 200;
const MAX_SUMMARY_LENGTH = 2_000;

export class ExternalAgentTurnToolCallDto
  implements IAgentExternalTurnToolCall
{
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SUMMARY_LENGTH)
  readonly argsSummary?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly durationMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SUMMARY_LENGTH)
  readonly error?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SUMMARY_LENGTH)
  readonly resultSummary?: string;

  @ApiProperty({ enum: ['completed', 'failed'] })
  @IsIn(['completed', 'failed'])
  readonly status!: 'completed' | 'failed';
}

export class ExternalAgentTurnUsageDto implements IAgentExternalTurnUsage {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly cachedInputTokens?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  readonly costUsd?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly inputTokens?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly outputTokens?: number;
}

/**
 * A turn the desktop app ran on the user's own Claude Code / Codex CLI
 * subscription. The API only records it — it never reserves or charges
 * Genfeed credits for it.
 */
export class AppendExternalAgentTurnDto implements IAgentExternalTurnInput {
  @ApiProperty({ maxLength: MAX_ASSISTANT_MESSAGE_LENGTH })
  @IsString()
  @MaxLength(MAX_ASSISTANT_MESSAGE_LENGTH)
  readonly assistantMessage!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  readonly completedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly model?: string;

  @ApiProperty({ enum: AGENT_EXTERNAL_RUNTIME_KEY_VALUES })
  @IsIn(AGENT_EXTERNAL_RUNTIME_KEY_VALUES)
  readonly runtimeKey!: AgentExternalRuntimeKey;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(AGENT_EXTERNAL_RUNTIME_SESSION_ID_PATTERN)
  readonly sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  readonly startedAt?: string;

  @ApiPropertyOptional({ type: [ExternalAgentTurnToolCallDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TOOL_CALLS)
  @ValidateNested({ each: true })
  @Type(() => ExternalAgentTurnToolCallDto)
  readonly toolCalls?: ExternalAgentTurnToolCallDto[];

  @ApiPropertyOptional({ type: ExternalAgentTurnUsageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalAgentTurnUsageDto)
  readonly usage?: ExternalAgentTurnUsageDto;

  @ApiProperty({ maxLength: MAX_USER_MESSAGE_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_USER_MESSAGE_LENGTH)
  readonly userMessage!: string;
}
