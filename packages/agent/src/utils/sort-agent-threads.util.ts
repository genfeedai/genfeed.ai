import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';

export function sortThreads(threads: AgentThread[]): AgentThread[] {
  return threads.toSorted((left, right) => {
    const pinnedDelta =
      Number(right.isPinned ?? false) - Number(left.isPinned ?? false);
    if (pinnedDelta !== 0) {
      return pinnedDelta;
    }

    return (
      new Date(right.updatedAt ?? right.createdAt).getTime() -
      new Date(left.updatedAt ?? left.createdAt).getTime()
    );
  });
}
