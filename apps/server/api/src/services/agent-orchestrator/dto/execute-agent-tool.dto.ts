import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * The only execution-context fields an HTTP caller may set. Everything else on
 * `ToolExecutionContext` (validated scope, credit governance, workflow scoping,
 * agent mode, brand/thread/run identity, ...) is trusted by the executor and is
 * derived on the server. Unknown keys are rejected with 400, so a new
 * server-only context field is denied by default.
 */
export class ExecuteAgentToolContextDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @ApiProperty({
    description:
      'Already-claimed MCP approval that authorizes this exact logical write',
    maxLength: 128,
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  approvedApprovalId?: string;
}

export class ExecuteAgentToolDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @ApiProperty({ required: false, type: () => ExecuteAgentToolContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecuteAgentToolContextDto)
  context?: ExecuteAgentToolContextDto;
}
