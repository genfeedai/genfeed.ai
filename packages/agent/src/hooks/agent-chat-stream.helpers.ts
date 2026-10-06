import type { BufferedThreadEvent } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import { isMutationApprovalReplacement } from '@genfeedai/agent/utils/is-mutation-approval-replacement.util';

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

/**
 * The reply that settles a run the socket did not. A reply stamped with the
 * run's id is its own, even when it is already loaded (one fetch can load the
 * replies of several queued runs). An unstamped (legacy) reply counts only
 * when it is new to the client and not older than the run — the thread's
 * history holds replies the client never hydrated — and never for a run that
 * must be matched by id.
 */
export function findRecoveredAssistantMessage(
  messages: readonly AgentChatMessage[],
  preAssistantIds: ReadonlySet<string>,
  runId: string | null = null,
  options: { notBefore?: string | null; requireRunId?: boolean } = {},
): AgentChatMessage | undefined {
  if (runId) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'assistant' && message.metadata?.runId === runId) {
        return message;
      }
    }
  }
  const notBefore = options.notBefore ? Date.parse(options.notBefore) : NaN;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant' || preAssistantIds.has(message.id)) {
      continue;
    }
    if (message.metadata?.runId) {
      // Another run's reply; with no run tracked, any new reply settles it.
      if (!runId) {
        return message;
      }
      continue;
    }
    if (options.requireRunId && runId) {
      continue;
    }
    if (
      Number.isFinite(notBefore) &&
      !(Date.parse(message.createdAt) >= notBefore)
    ) {
      continue;
    }
    return message;
  }
  return undefined;
}

/**
 * A ui-action run's reply can carry the server-resolved copy of the card that
 * started it (the server already wrote that copy onto the source message).
 * Split it out: it updates the source card in place, never renders as a new
 * card in the reply.
 */
export function takeSourceActionUpdate(
  actions: unknown,
  sourceId: string,
): { card: AgentUiAction | null; replyActions: AgentUiAction[] | undefined } {
  if (!Array.isArray(actions)) {
    return { card: null, replyActions: undefined };
  }
  let card: AgentUiAction | null = null;
  const replyActions: AgentUiAction[] = [];
  for (const candidate of actions as AgentUiAction[]) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      (candidate.id === sourceId ||
        isMutationApprovalReplacement(candidate, sourceId))
    ) {
      card ??= candidate;
      continue;
    }
    replyActions.push(candidate);
  }
  return { card, replyActions };
}

/** The failure a reply records for a run that failed without throwing. */
export function readRecordedRunFailure(
  metadata: { runOutcome?: unknown } | undefined,
): string | null {
  const outcome = metadata?.runOutcome;
  if (
    !outcome ||
    typeof outcome !== 'object' ||
    !('status' in outcome) ||
    outcome.status !== 'failed'
  ) {
    return null;
  }
  return 'error' in outcome &&
    typeof outcome.error === 'string' &&
    outcome.error.trim()
    ? outcome.error
    : 'The action failed before it finished.';
}
