import type { McpApproval } from '@genfeedai/prisma';

export type { McpApproval } from '@genfeedai/prisma';

export interface McpApprovalDocument extends McpApproval {
  _id?: string;
  [key: string]: unknown;
}
