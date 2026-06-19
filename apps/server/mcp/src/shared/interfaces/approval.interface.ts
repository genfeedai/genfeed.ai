export type McpApprovalStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface McpApprovalResource {
  id: string;
  status: McpApprovalStatus;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  resolvedAt?: string | null;
  createdAt?: string;
}

export type McpApprovalDecision = 'approve' | 'decline';
