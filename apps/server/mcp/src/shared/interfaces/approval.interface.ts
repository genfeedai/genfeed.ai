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
