import { MaxJsonBytes } from '@api/collections/mcp-approvals/validators/max-json-bytes.validator';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { MCP_TOOL_RESULT_MAX_JSON_BYTES } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class EvaluateMcpToolResultDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @ApiProperty({
    description:
      'Complete serialized tool result observed by the authenticated caller',
  })
  @IsString()
  @MaxJsonBytes(MCP_TOOL_RESULT_MAX_JSON_BYTES)
  content!: string;

  @ApiProperty({
    description:
      'True when content is a bounded sample of a larger result, so part of what the caller returns to its model was not sent for classification',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPartial?: boolean;
}
