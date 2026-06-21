import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional } from 'class-validator';

export class ResolveMcpApprovalDto {
  @ApiProperty({
    description: 'Decision on the approval request',
    enum: ['approve', 'decline'],
  })
  @IsIn(['approve', 'decline'])
  decision!: 'approve' | 'decline';

  @ApiPropertyOptional({
    description: 'Optional result payload for approved actions',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;
}
