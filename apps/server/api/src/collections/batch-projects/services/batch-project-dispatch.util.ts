import { DEFAULT_AGENT_VIDEO_DURATION_SECONDS } from '@genfeedai/contracts/constants';
import type {
  BatchIdea,
  BatchIdeaFormat,
  BatchProjectBillingMode,
  IBatchProjectItemDispatch,
  IBatchProjectQuote,
  IBatchProjectQuoteLine,
} from '@genfeedai/contracts/interfaces';
import {
  readNonEmptyString,
  readRecordOrNull,
} from '@genfeedai/utils/data/extract.util';

/** Idea generation renders portrait short-form media. */
export const IDEA_OUTPUT_ASPECT_RATIO = '9:16';
export const IDEA_OUTPUT_WIDTH = 1080;
export const IDEA_OUTPUT_HEIGHT = 1920;

export type IdeaGenerationParams = {
  aspectRatio: string;
  duration?: number;
  height: number;
  width: number;
};

/**
 * The generation parameters of an idea. The quote prices exactly these
 * (the estimator takes the explicit size) and the dispatch requests them,
 * so an accepted price always matches the reservation.
 */
export function resolveIdeaGenerationParams(
  format: BatchIdeaFormat,
): IdeaGenerationParams {
  return {
    aspectRatio: IDEA_OUTPUT_ASPECT_RATIO,
    height: IDEA_OUTPUT_HEIGHT,
    width: IDEA_OUTPUT_WIDTH,
    ...(format === 'video'
      ? { duration: DEFAULT_AGENT_VIDEO_DURATION_SECONDS }
      : {}),
  };
}

const FORMATS = new Set<string>(['avatar', 'image', 'video']);
const BILLING_MODES = new Set<string>(['byok', 'platform']);
const DISPATCH_STATES = new Set<string>([
  'queued',
  'released',
  'reserved',
  'settled',
]);

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

/**
 * The attempt an idea's next generation runs as: one past the attempt its
 * last dispatch used, so a retry never reuses a released reservation.
 */
export function nextIdeaAttempt(item: {
  dispatch: unknown;
  retryCount: number;
}): number {
  return (
    (parseBatchProjectItemDispatch(item.dispatch)?.attempt ?? item.retryCount) +
    1
  );
}

/** Reservation and job key of one generation attempt of one idea item. */
export function ideaDispatchKey(itemId: string, attempt: number): string {
  return `batch-project-item:${itemId}:dispatch:${attempt}`;
}

/**
 * The prompt an idea generates from: the visual prompt, else the hook, else
 * the caption. Avatar ideas speak their script (else the caption).
 */
export function ideaPromptText(idea: BatchIdea): string {
  if (idea.format === 'avatar') {
    return ideaSpeechText(idea);
  }
  return idea.visualPrompt.trim() || idea.hook.trim() || idea.caption.trim();
}

export function ideaSpeechText(idea: BatchIdea): string {
  return (idea.speechText ?? idea.caption ?? '').trim();
}

function parseQuoteLine(value: unknown): IBatchProjectQuoteLine | null {
  const record = readRecordOrNull(value);
  const itemId = readNonEmptyString(record?.itemId);
  const key = readNonEmptyString(record?.key);
  const format = readNonEmptyString(record?.format);
  const model = readNonEmptyString(record?.model);
  const billingMode = readNonEmptyString(record?.billingMode);
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
    format: format as BatchIdeaFormat,
    itemId,
    key,
    model,
  };
}

/** Parse a stored quote; a malformed quote reads as none. */
export function parseBatchProjectQuote(
  value: unknown,
): IBatchProjectQuote | null {
  const record = readRecordOrNull(value);
  const id = readNonEmptyString(record?.id);
  const revision = readCount(record?.revision);
  const createdAt = readNonEmptyString(record?.createdAt);
  const expiresAt = readNonEmptyString(record?.expiresAt);
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
  const acceptedAt = readNonEmptyString(record.acceptedAt);
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
  const record = readRecordOrNull(value);
  const key = readNonEmptyString(record?.key);
  const model = readNonEmptyString(record?.model);
  const billingMode = readNonEmptyString(record?.billingMode);
  const state = readNonEmptyString(record?.state);
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
  const reservationId = readNonEmptyString(record?.reservationId);
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
