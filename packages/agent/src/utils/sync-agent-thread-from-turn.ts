import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadStatus } from '@genfeedai/contracts';

export interface SyncAgentThreadFromTurnInput {
  activeThreadId: string | null;
  brandId?: string | null;
  contextVersion?: number;
  createdAt?: string;
  planModeEnabled?: boolean;
  setActiveThread: (threadId: string | null) => void;
  threadId: string;
  title: string;
  upsertThread: (thread: AgentThread) => void;
}

/**
 * Write the turn's thread into the sidebar store immediately.
 * Title and `updatedAt` come from the turn payload — no guessed refresh delay.
 */
export function syncAgentThreadFromTurn(
  input: SyncAgentThreadFromTurnInput,
): void {
  if (input.threadId !== input.activeThreadId) {
    input.setActiveThread(input.threadId);
  }

  const now = new Date().toISOString();
  input.upsertThread({
    brandId: input.brandId,
    contextVersion: input.contextVersion ?? 1,
    createdAt: input.createdAt ?? now,
    id: input.threadId,
    planModeEnabled: input.planModeEnabled,
    status: AgentThreadStatus.ACTIVE,
    title: input.title,
    updatedAt: now,
  });
}
