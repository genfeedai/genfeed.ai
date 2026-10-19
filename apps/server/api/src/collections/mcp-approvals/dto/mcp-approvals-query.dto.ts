import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import { McpApprovalStatus } from '@genfeedai/prisma';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class McpApprovalsQueryDto extends PageQueryDto {
  @ApiProperty({
    description: 'Filter approvals by status',
    enum: McpApprovalStatus,
    enumName: 'McpApprovalStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(McpApprovalStatus)
  status?: McpApprovalStatus;
}
