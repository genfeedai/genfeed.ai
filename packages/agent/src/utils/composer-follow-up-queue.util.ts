import type { ExtractedMention } from '@genfeedai/agent/components/AgentChatInput';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';

export const COMPOSER_FOLLOW_UP_QUEUE_CAPACITY = 10;

export const UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY = '';

export type ComposerFollowUpStatus = 'queued' | 'sending' | 'failed';

export type ComposerFollowUpEnqueueReason = 'empty' | 'capacity';

export type ComposerFollowUp = {
  attachments?: ChatAttachment[];
  content: string;
  createdAt: string;
  id: string;
  mentions?: ExtractedMention[];
  options?: ConversationComposerSendOptions;
  status: ComposerFollowUpStatus;
  threadId: string | null;
};

export type ComposerFollowUpQueues = Readonly<
  Record<string, readonly ComposerFollowUp[]>
>;

export type EnqueueComposerFollowUpResult =
  | { accepted: true; queue: ComposerFollowUp[] }
  | {
      accepted: false;
      queue: ComposerFollowUp[];
      reason: ComposerFollowUpEnqueueReason;
    };

export function getComposerFollowUpThreadKey(threadId: string | null): string {
  return threadId ?? UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY;
}

export function getComposerFollowUpQueue(
  queues: ComposerFollowUpQueues,
  threadId: string | null,
): ComposerFollowUp[] {
  return [...(queues[getComposerFollowUpThreadKey(threadId)] ?? [])];
}

export function createComposerFollowUp(
  content: string,
  extras: Pick<
    ComposerFollowUp,
    'attachments' | 'mentions' | 'options' | 'threadId'
  > = {},
  createId: () => string = () =>
    `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  now: () => string = () => new Date().toISOString(),
): ComposerFollowUp {
  return {
    ...extras,
    content: content.trim(),
    createdAt: now(),
    id: createId(),
    status: 'queued',
    threadId: extras.threadId ?? null,
  };
}

export function enqueueComposerFollowUp(
  queue: readonly ComposerFollowUp[],
  item: ComposerFollowUp,
  capacity: number = COMPOSER_FOLLOW_UP_QUEUE_CAPACITY,
): EnqueueComposerFollowUpResult {
  const current = [...queue];
  if (!item.content) {
    return { accepted: false, queue: current, reason: 'empty' };
  }

  if (current.length >= capacity) {
    return { accepted: false, queue: current, reason: 'capacity' };
  }

  return { accepted: true, queue: [...current, item] };
}

export function removeComposerFollowUp(
  queue: readonly ComposerFollowUp[],
  id: string,
): ComposerFollowUp[] {
  return queue.filter((item) => item.id !== id);
}

export function moveComposerFollowUp(
  queue: readonly ComposerFollowUp[],
  fromIndex: number,
  toIndex: number,
): ComposerFollowUp[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= queue.length ||
    toIndex >= queue.length
  ) {
    return [...queue];
  }

  const next = [...queue];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return next;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function markComposerFollowUpStatus(
  queue: readonly ComposerFollowUp[],
  id: string,
  status: ComposerFollowUpStatus,
): ComposerFollowUp[] {
  return queue.map((item) => (item.id === id ? { ...item, status } : item));
}

export function getOldestDispatchableComposerFollowUp(
  queue: readonly ComposerFollowUp[],
): ComposerFollowUp | null {
  const head = queue[0];
  if (head?.status !== 'queued') {
    return null;
  }

  return head ?? null;
}

export function hasSendingComposerFollowUp(
  queue: readonly ComposerFollowUp[],
): boolean {
  return queue.some((item) => item.status === 'sending');
}

export function hasFailedComposerFollowUp(
  queue: readonly ComposerFollowUp[],
): boolean {
  return queue.some((item) => item.status === 'failed');
}

export function takeNextComposerFollowUp(queue: readonly ComposerFollowUp[]): {
  next: ComposerFollowUp | null;
  remaining: ComposerFollowUp[];
} {
  const next = getOldestDispatchableComposerFollowUp(queue);
  if (!next) {
    return {
      next: null,
      remaining: [...queue],
    };
  }

  return {
    next,
    remaining: removeComposerFollowUp(queue, next.id),
  };
}

export function setComposerFollowUpQueue(
  queues: ComposerFollowUpQueues,
  threadId: string | null,
  queue: readonly ComposerFollowUp[],
): Record<string, ComposerFollowUp[]> {
  const key = getComposerFollowUpThreadKey(threadId);
  const next: Record<string, ComposerFollowUp[]> = {};
  for (const [existingKey, existingQueue] of Object.entries(queues)) {
    if (existingKey !== key) {
      next[existingKey] = [...existingQueue];
    }
  }

  if (queue.length > 0) {
    next[key] = [...queue];
  }

  return next;
}

export function migrateUnassignedComposerFollowUpQueue(
  queues: ComposerFollowUpQueues,
  threadId: string,
): Record<string, ComposerFollowUp[]> {
  const unassigned = getComposerFollowUpQueue(
    queues,
    UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY,
  );
  if (unassigned.length === 0) {
    return setComposerFollowUpQueue(
      queues,
      threadId,
      getComposerFollowUpQueue(queues, threadId),
    );
  }

  const assigned = getComposerFollowUpQueue(queues, threadId);
  const merged =
    assigned.length === 0
      ? unassigned.map((item) => ({ ...item, threadId }))
      : assigned;

  let next = setComposerFollowUpQueue(
    queues,
    UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY,
    [],
  );
  next = setComposerFollowUpQueue(next, threadId, merged);
  return next;
}
