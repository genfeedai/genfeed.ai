import type { AgentThread as PrismaAgentThread } from '@genfeedai/prisma';

export type { AgentThread as PrismaAgentThread } from '@genfeedai/prisma';

/**
 * Prisma row plus the Mongo-era aliases some read paths still reference.
 *
 * Conversation fields (`planModeEnabled`, `source`, `systemPrompt`,
 * `requestedModel`, `runtimeKey`, `isPinned`, `memoryEntryIds`,
 * `parentThreadId`) used to be declared here *only* — they were never real
 * columns, so every write that set them threw `Unknown argument` at runtime
 * while still type-checking. They are now columns on `agent_threads` and are
 * inherited from `PrismaAgentThread`; never redeclare a field here to make a
 * write compile.
 *
 * `organization` / `user` are legacy aliases and are `undefined` on real rows
 * unless the query `include`s the relation — read `organizationId` / `userId`.
 * See `.agents/memory/rules/prisma_legacy_alias_fields.md`.
 */
export interface AgentRoomDocument extends Omit<PrismaAgentThread, 'config'> {
  _id: string;
  config?: Record<string, unknown>;
  organization: string;
  user: string;
  [key: string]: unknown;
}

export type AgentThread = AgentRoomDocument;
