import type { AgentThread as PrismaAgentThread } from '@genfeedai/prisma';

export type { AgentThread as PrismaAgentThread } from '@genfeedai/prisma';

export interface AgentRoomDocument extends Omit<PrismaAgentThread, 'config'> {
  _id: string;
  config?: Record<string, unknown>;
  isPinned?: boolean;
  memoryEntryIds?: string[];
  organization: string;
  parentThreadId?: string | null;
  planModeEnabled?: boolean;
  requestedModel?: string | null;
  runtimeKey?: string | null;
  source?: string | null;
  status?: string | null;
  systemPrompt?: string | null;
  user: string;
  [key: string]: unknown;
}

export type AgentThread = AgentRoomDocument;
