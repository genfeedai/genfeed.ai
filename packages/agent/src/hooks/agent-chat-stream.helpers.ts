import type { BufferedThreadEvent } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';

/**
 * True when an event belongs to a run other than the one the stream tracks.
 * Events without a run id, or a stream that has not pinned a run yet, pass.
 */
export function isForeignRunEvent(
  eventRunId: string | null | undefined,
  trackedRunId: string | null,
): boolean {
  return Boolean(trackedRunId && eventRunId && eventRunId !== trackedRunId);
}

/**
 * Drain events buffered before the thread (or its run) was known. Events for
 * the thread replay in order; those stamped with another run are discarded.
 */
export function flushBufferedEventsForThread(
  buffered: BufferedThreadEvent[],
  threadId: string,
  runId: string | null = null,
): BufferedThreadEvent[] {
  const remaining: BufferedThreadEvent[] = [];

  for (const event of buffered) {
    if (event.threadId === threadId) {
      if (!isForeignRunEvent(event.runId, runId)) {
        event.handler(event.data);
      }
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
  runId: string | null = null,
): AgentChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message &&
      message.role === 'assistant' &&
      !preAssistantIds.has(message.id) &&
      !isForeignRunEvent(message.metadata?.runId, runId)
    ) {
      return message;
    }
  }
  return undefined;
}
