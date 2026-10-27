import { createHash } from 'node:crypto';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const SCORE_PATTERN = /^-?\d{1,3}(\.\d{1,6})?$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface KnowledgeSearchPosition {
  entryId: string;
  /** Decimal with at most six places; compared as numeric, never as a float. */
  score: string;
}

export class InvalidKnowledgeSearchCursorError extends Error {
  constructor() {
    super('invalid_cursor');
  }
}

/** Everything the cursor is only valid for; a different search needs a new cursor. */
export function knowledgeSearchFingerprint(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function encodeKnowledgeSearchCursor(
  position: KnowledgeSearchPosition,
  fingerprint: string,
): string {
  return Buffer.from(
    JSON.stringify({
      f: fingerprint,
      i: position.entryId,
      s: position.score,
      v: CURSOR_VERSION,
    }),
  ).toString('base64url');
}

/**
 * Reads a cursor, failing closed: a cursor that is malformed, oversized or from
 * a different query, filter set or scope is rejected, never reinterpreted.
 */
export function decodeKnowledgeSearchCursor(
  cursor: string,
  fingerprint: string,
): KnowledgeSearchPosition {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new InvalidKnowledgeSearchCursorError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidKnowledgeSearchCursorError();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidKnowledgeSearchCursorError();
  }
  const { f, i, s, v } = parsed as Record<string, unknown>;
  if (
    v !== CURSOR_VERSION ||
    f !== fingerprint ||
    typeof i !== 'string' ||
    !ID_PATTERN.test(i) ||
    typeof s !== 'string' ||
    !SCORE_PATTERN.test(s)
  ) {
    throw new InvalidKnowledgeSearchCursorError();
  }
  return { entryId: i, score: s };
}
