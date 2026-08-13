import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';

export type ComposerFollowUp = {
  attachments?: ChatAttachment[];
  content: string;
  createdAt: string;
  id: string;
  options?: ConversationComposerSendOptions;
};

export function createComposerFollowUp(
  content: string,
  extras: Pick<ComposerFollowUp, 'attachments' | 'options'> = {},
  createId: () => string = () =>
    `follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  now: () => string = () => new Date().toISOString(),
): ComposerFollowUp {
  return {
    ...extras,
    content: content.trim(),
    createdAt: now(),
    id: createId(),
  };
}

export function enqueueComposerFollowUp(
  queue: readonly ComposerFollowUp[],
  item: ComposerFollowUp,
): ComposerFollowUp[] {
  if (!item.content) {
    return [...queue];
  }

  return [...queue, item];
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

export function takeNextComposerFollowUp(queue: readonly ComposerFollowUp[]): {
  next: ComposerFollowUp | null;
  remaining: ComposerFollowUp[];
} {
  const [next, ...remaining] = queue;
  return {
    next: next ?? null,
    remaining,
  };
}
