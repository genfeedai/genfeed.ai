import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';

export type ThreadGenerationType = 'image' | 'video';

function isThreadGenerationType(
  value: string | undefined,
): value is ThreadGenerationType {
  return value === 'image' || value === 'video';
}

/**
 * First image/video generation card in a thread locks that conversation.
 * Image and video do not share a thread — a later video card must not
 * replace the docked Generate Image form (and vice versa).
 */
export function resolveThreadGenerationType(
  messages: readonly AgentChatMessage[],
  threadId?: string | null,
): ThreadGenerationType | null {
  const chronological = [...messages].toSorted((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );

  for (const message of chronological) {
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
