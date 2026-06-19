import {
  DEFAULT_MAX_JSON_BYTES,
  MaxJsonBytes,
} from '@api/collections/mcp-approvals/validators/max-json-bytes.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength } from 'class-validator';

export class CreateMcpApprovalDto {
  @ApiProperty({ description: 'Name of the MCP tool to be executed' })
  @IsString()
  @MaxLength(200)
  toolName!: string;

  @ApiProperty({
    additionalProperties: true,
    description: 'Arguments to pass to the MCP tool',
    type: 'object',
  })
  @IsObject()
  @MaxJsonBytes(DEFAULT_MAX_JSON_BYTES)
  arguments!: Record<string, unknown>;
}
