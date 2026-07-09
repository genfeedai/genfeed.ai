import type { AgentRun } from '@genfeedai/prisma';

export type { AgentRun } from '@genfeedai/prisma';

export interface AgentRunToolCall {
  status?: string;
  [key: string]: unknown;
}

export interface AgentRunStep {
  status?: string;
  [key: string]: unknown;
}

export interface AgentRunDocument
  extends Omit<AgentRun, 'durationMs' | 'steps' | 'toolCalls'> {
  _id: string;
  brand?: string | null;
  durationMs?: number | null;
  organization: string;
  steps?: AgentRunStep[];
  toolCalls?: AgentRunToolCall[];
  user: string;
  [key: string]: unknown;
}
