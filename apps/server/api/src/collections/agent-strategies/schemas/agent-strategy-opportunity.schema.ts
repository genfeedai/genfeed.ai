import type { AgentStrategyOpportunity } from '@genfeedai/prisma';

export type { AgentStrategyOpportunity } from '@genfeedai/prisma';

export interface AgentStrategyOpportunityDocument
  extends AgentStrategyOpportunity {
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
