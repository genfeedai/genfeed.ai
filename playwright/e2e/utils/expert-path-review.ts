export const ITEM_REVIEW_ACTIONS = ['approve', 'edit', 'reject'] as const;

export type ItemReviewAction = (typeof ITEM_REVIEW_ACTIONS)[number];

export interface ItemReviewBody {
  action: ItemReviewAction;
  topic?: string;
}

function isItemReviewAction(value: string): value is ItemReviewAction {
  return (ITEM_REVIEW_ACTIONS as readonly string[]).includes(value);
}

export function parseItemReviewBody(body: unknown): ItemReviewBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expert Path item review body must be an object');
  }

  const record = body as { action?: unknown; topic?: unknown };
  if (typeof record.action !== 'string' || !isItemReviewAction(record.action)) {
    throw new Error(
      'Expert Path item review action must be approve, edit, or reject',
    );
  }

  const topic =
    typeof record.topic === 'string' && record.topic.trim().length > 0
      ? record.topic
      : undefined;
  return topic ? { action: record.action, topic } : { action: record.action };
}

export function readItemReviewBody(readBody: () => unknown): ItemReviewBody {
  let body: unknown;
  try {
    body = readBody();
  } catch {
    throw new Error('Expert Path item review body is not valid JSON');
  }
  return parseItemReviewBody(body);
}
