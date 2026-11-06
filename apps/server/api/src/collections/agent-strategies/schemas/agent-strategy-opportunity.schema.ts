import type { AgentStrategyOpportunity } from '@genfeedai/prisma';

export type { AgentStrategyOpportunity } from '@genfeedai/prisma';

/**
 * The document reads every field from `data`; the promoted filter columns
 * (`status`, `sourceType`, `topic`, `sourceRef`, `priorityScore`) are copies
 * of those keys and are not part of it.
 */
export interface AgentStrategyOpportunityDocument
  extends Omit<
    AgentStrategyOpportunity,
    'priorityScore' | 'sourceRef' | 'sourceType' | 'status' | 'topic'
  > {
  decisionReason?: string;
  estimatedCreditCost: number;
  expectedTrafficScore: number;
  expiresAt?: Date | string | null;
  formatCandidates: string[];
  metadata?: Record<string, unknown>;
  platformCandidates: string[];
  priorityScore: number;
  relevanceScore: number;
  sourceRef?: string;
  sourceType: 'event' | 'evergreen' | 'trend' | string;
  status: string;
  topic: string;
  [key: string]: unknown;
}
