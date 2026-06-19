import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

export class CreateMcpApprovalDto {
  @ApiProperty({ description: 'Name of the MCP tool to be executed' })
  @IsString()
  toolName!: string;

  @ApiProperty({
    description: 'Arguments to pass to the MCP tool',
    type: 'object',
  })
  @IsObject()
  arguments!: Record<string, unknown>;
}
