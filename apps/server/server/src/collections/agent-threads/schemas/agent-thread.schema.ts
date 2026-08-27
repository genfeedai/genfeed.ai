import type { AgentThread as PrismaAgentThread } from '@genfeedai/prisma';

export type { AgentThread as PrismaAgentThread } from '@genfeedai/prisma';

/** Prisma thread row with object-shaped config for server consumers. */
export interface AgentRoomDocument extends Omit<PrismaAgentThread, 'config'> {
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export type AgentThread = AgentRoomDocument;
