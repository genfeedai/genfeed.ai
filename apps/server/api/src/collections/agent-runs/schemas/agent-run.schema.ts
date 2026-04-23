import type { AgentRun } from '@genfeedai/prisma';

export type { AgentRun } from '@genfeedai/prisma';

export interface AgentRunToolCall {
  status?: string;
  [key: string]: unknown;
}

export interface AgentRunDocument extends AgentRun {
  _id: string;
  durationMs?: number | null;
  organization: string;
  toolCalls?: AgentRunToolCall[];
  user: string;
  [key: string]: unknown;
}
