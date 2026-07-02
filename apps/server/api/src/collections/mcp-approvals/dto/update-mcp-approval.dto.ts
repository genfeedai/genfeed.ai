import { PartialType } from '@nestjs/swagger';

import { CreateMcpApprovalDto } from './create-mcp-approval.dto';

export class UpdateMcpApprovalDto extends PartialType(CreateMcpApprovalDto) {}
