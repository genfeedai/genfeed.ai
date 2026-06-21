import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class AttachMcpApprovalResultDto {
  @ApiProperty({
    description: 'Execution result payload to persist on the approved approval',
    type: 'object',
  })
  @IsObject()
  result!: Record<string, unknown>;
}
