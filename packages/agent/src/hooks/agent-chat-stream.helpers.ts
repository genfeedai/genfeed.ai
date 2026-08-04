import type { BufferedThreadEvent } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';

/** Drain events buffered for a thread that was not yet active. */
export function flushBufferedEventsForThread(
  buffered: BufferedThreadEvent[],
  threadId: string,
): BufferedThreadEvent[] {
  const remaining: BufferedThreadEvent[] = [];

  for (const event of buffered) {
    if (event.threadId === threadId) {
      event.handler(event.data);
      continue;
    }
    remaining.push(event);
  }

  return remaining;
}

export function collectAssistantMessageIds(
  messages: readonly AgentChatMessage[],
): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role === 'assistant') {
      ids.add(message.id);
    }
  }
  return ids;
}

export function findRecoveredAssistantMessage(
  messages: readonly AgentChatMessage[],
  preAssistantIds: ReadonlySet<string>,
): AgentChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message &&
      message.role === 'assistant' &&
      !preAssistantIds.has(message.id)
    ) {
      return message;
    }
  }
  return undefined;
}
