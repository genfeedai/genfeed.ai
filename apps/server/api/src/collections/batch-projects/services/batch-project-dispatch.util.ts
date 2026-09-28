import type {
  BatchProjectBillingMode,
  FastlaneFormat,
  FastlaneIdea,
  IBatchProjectItemDispatch,
  IBatchProjectQuote,
  IBatchProjectQuoteLine,
} from '@genfeedai/contracts/interfaces';

/** Idea generation renders portrait short-form media, as Fastlane did. */
export const IDEA_OUTPUT_ASPECT_RATIO = '9:16';
export const IDEA_OUTPUT_WIDTH = 1080;
export const IDEA_OUTPUT_HEIGHT = 1920;

const FORMATS = new Set<string>(['avatar', 'image', 'video']);
const BILLING_MODES = new Set<string>(['byok', 'platform']);
const DISPATCH_STATES = new Set<string>([
  'queued',
  'released',
  'reserved',
  'settled',
]);

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Reservation and job key of one generation attempt of one idea item. */
export function ideaDispatchKey(itemId: string, attempt: number): string {
  return `batch-project-item:${itemId}:dispatch:${attempt}`;
}

/**
 * The prompt an idea generates from — the server-side port of Fastlane's
 * browser mapping: the visual prompt, else the hook, else the caption. Avatar
 * ideas speak their script (else the caption).
 */
export function ideaPromptText(idea: FastlaneIdea): string {
  if (idea.format === 'avatar') {
    return ideaSpeechText(idea);
  }
  return idea.visualPrompt.trim() || idea.hook.trim() || idea.caption.trim();
}

export function ideaSpeechText(idea: FastlaneIdea): string {
  return (idea.speechText ?? idea.caption ?? '').trim();
}

function parseQuoteLine(value: unknown): IBatchProjectQuoteLine | null {
  const record = readRecord(value);
  const itemId = readString(record?.itemId);
  const key = readString(record?.key);
  const format = readString(record?.format);
  const model = readString(record?.model);
  const billingMode = readString(record?.billingMode);
  const attempt = readCount(record?.attempt);
  const credits = readCount(record?.credits);
  if (
    !itemId ||
    !key ||
    !format ||
    !FORMATS.has(format) ||
    !model ||
    !billingMode ||
    !BILLING_MODES.has(billingMode) ||
    attempt === undefined ||
    credits === undefined
  ) {
    return null;
  }
  return {
    attempt,
    billingMode: billingMode as BatchProjectBillingMode,
    credits,
    format: format as FastlaneFormat,
    itemId,
    key,
    model,
  };
}

/** Parse a stored quote; a malformed quote reads as none. */
export function parseBatchProjectQuote(
  value: unknown,
): IBatchProjectQuote | null {
  const record = readRecord(value);
  const id = readString(record?.id);
  const revision = readCount(record?.revision);
  const createdAt = readString(record?.createdAt);
  const expiresAt = readString(record?.expiresAt);
  if (
    !record ||
    !id ||
    revision === undefined ||
    !createdAt ||
    !expiresAt ||
    !Array.isArray(record.items)
  ) {
    return null;
  }
  const items: IBatchProjectQuoteLine[] = [];
  for (const entry of record.items) {
    const line = parseQuoteLine(entry);
    if (!line) {
      return null;
    }
    items.push(line);
  }
  const acceptedAt = readString(record.acceptedAt);
  return {
    createdAt,
    expiresAt,
    id,
    items,
    revision,
    total: items.reduce((sum, line) => sum + line.credits, 0),
    ...(acceptedAt ? { acceptedAt } : {}),
  };
}

/** Parse an item's dispatch record; a malformed one reads as none. */
export function parseBatchProjectItemDispatch(
  value: unknown,
): IBatchProjectItemDispatch | null {
  const record = readRecord(value);
  const key = readString(record?.key);
  const model = readString(record?.model);
  const billingMode = readString(record?.billingMode);
  const state = readString(record?.state);
  const attempt = readCount(record?.attempt);
  const credits = readCount(record?.credits);
  if (
    !key ||
    !model ||
    !billingMode ||
    !BILLING_MODES.has(billingMode) ||
    !state ||
    !DISPATCH_STATES.has(state) ||
    attempt === undefined ||
    credits === undefined
  ) {
    return null;
  }
  const reservationId = readString(record?.reservationId);
  return {
    attempt,
    billingMode: billingMode as BatchProjectBillingMode,
    credits,
    key,
    model,
    state: state as IBatchProjectItemDispatch['state'],
    ...(reservationId ? { reservationId } : {}),
  };
}

/** The dispatch record an accepted quote line starts an item with. */
export function toQueuedDispatch(
  line: IBatchProjectQuoteLine,
): IBatchProjectItemDispatch {
  return {
    attempt: line.attempt,
    billingMode: line.billingMode,
    credits: line.credits,
    key: line.key,
    model: line.model,
    state: 'queued',
  };
}
