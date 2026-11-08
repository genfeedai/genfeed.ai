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
  /** Slug of the approval's organization, for its web link. */
  organizationSlug?: string | null;
  /** Slug of the brand the call named; null for an organization-level call. */
  brandSlug?: string | null;
}

export type McpApprovalDecision = 'approve' | 'decline';

/**
 * The requester's own answer to an approval prompt their MCP client showed
 * them (#9647). It arrives as the client's elicitation response, which the
 * model cannot write, bound to one approval by signed request state.
 */
export interface McpApprovalAnswer {
  approvalId: string;
  decision: McpApprovalDecision;
}
