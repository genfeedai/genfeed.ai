import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';

export type ThreadGenerationType = 'image' | 'video';

function isThreadGenerationType(
  value: string | undefined,
): value is ThreadGenerationType {
  return value === 'image' || value === 'video';
}

/** Resolve the most recently prepared media type for the docked controls. */
export function resolveThreadGenerationType(
  messages: readonly AgentChatMessage[],
  threadId?: string | null,
): ThreadGenerationType | null {
  const reverseChronological = [...messages].toSorted((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  for (const message of reverseChronological) {
    if (threadId && message.threadId !== threadId) {
      continue;
    }

    for (const action of message.metadata?.uiActions ?? []) {
      if (
        action.type === 'generation_action_card' &&
        isThreadGenerationType(action.generationType)
      ) {
        return action.generationType;
      }
    }
  }

  return null;
}
