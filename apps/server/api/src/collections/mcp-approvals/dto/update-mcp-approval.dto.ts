import { PartialType } from '@nestjs/mapped-types';

import { CreateMcpApprovalDto } from './create-mcp-approval.dto';

export class UpdateMcpApprovalDto extends PartialType(CreateMcpApprovalDto) {}
