import type { McpApprovalStatus } from '@genfeedai/contracts';
import type { AgentGenerationQuote } from '@genfeedai/contracts/interfaces';

export interface McpApprovalResource {
  id: string;
  status: McpApprovalStatus;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  resolvedAt?: string | null;
  createdAt?: string;
  generationQuote?: AgentGenerationQuote;
}

export type McpApprovalDecision = 'approve' | 'decline';
