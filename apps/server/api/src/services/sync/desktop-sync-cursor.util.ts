import { BadRequestException } from '@nestjs/common';

/**
 * Keyset position of the last row a client received for one synced
 * collection. `id` is absent only for legacy plain-ISO cursors, which carried
 * no tie-breaker — those keep the old `updatedAt > cursor` semantics until
 * the client stores a composite cursor from its next pull.
 */
export interface DesktopSyncCursorPosition {
  id?: string;
  updatedAt: string;
}

/**
 * Per-collection positions of the desktop brand-manifest pull. Encoded as one
 * opaque string so the desktop client keeps storing a single cursor per
 * scope. A missing entry means "never synced" for that collection.
 */
export interface DesktopManifestCursorPositions {
  assets?: DesktopSyncCursorPosition;
  brands?: DesktopSyncCursorPosition;
  ingredients?: DesktopSyncCursorPosition;
}

type CursorRecord = { id: string; updatedAt: Date };

/**
 * Prisma `where` fragment selecting rows strictly after `position` in
 * ascending `(updatedAt, id)` order. Pages must be fetched with
 * `orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }]` for the keyset to be
 * lossless across ties on `updatedAt`.
 */
export interface DesktopSyncCursorWhere {
  OR?: Array<
    { updatedAt: { gt: Date } } | { id: { gt: string }; updatedAt: Date }
  >;
  updatedAt?: { gt: Date };
}

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;

function isCursorPosition(value: unknown): value is DesktopSyncCursorPosition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.updatedAt !== 'string') {
    return false;
  }
  if (Number.isNaN(new Date(candidate.updatedAt).getTime())) {
    return false;
  }
  return candidate.id === undefined || typeof candidate.id === 'string';
}

function decodeCursorPayload(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed desktop sync cursor.');
  }
}

export function encodeManifestCursor(
  positions: DesktopManifestCursorPositions,
): string {
  return Buffer.from(JSON.stringify(positions), 'utf8').toString('base64url');
}

export function decodeManifestCursor(
  cursor?: string,
): DesktopManifestCursorPositions {
  if (!cursor) {
    return {};
  }

  // Legacy cursors were a bare ISO timestamp covering every collection.
  if (ISO_TIMESTAMP_PATTERN.test(cursor)) {
    if (Number.isNaN(new Date(cursor).getTime())) {
      throw new BadRequestException('Malformed desktop sync cursor.');
    }
    const position: DesktopSyncCursorPosition = { updatedAt: cursor };
    return { assets: position, brands: position, ingredients: position };
  }

  const payload = decodeCursorPayload(cursor);
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestException('Malformed desktop sync cursor.');
  }

  const positions: DesktopManifestCursorPositions = {};
  for (const key of ['assets', 'brands', 'ingredients'] as const) {
    const value = (payload as Record<string, unknown>)[key];
    if (value === undefined) {
      continue;
    }
    if (!isCursorPosition(value)) {
      throw new BadRequestException('Malformed desktop sync cursor.');
    }
    positions[key] = { id: value.id, updatedAt: value.updatedAt };
  }
  return positions;
}

export function encodeThreadCursor(
  position: DesktopSyncCursorPosition,
): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

export function decodeThreadCursor(
  cursor?: string,
): DesktopSyncCursorPosition | undefined {
  if (!cursor) {
    return undefined;
  }

  // Legacy cursors were a bare ISO timestamp with no tie-breaking id.
  if (ISO_TIMESTAMP_PATTERN.test(cursor)) {
    if (Number.isNaN(new Date(cursor).getTime())) {
      throw new BadRequestException('Malformed desktop sync cursor.');
    }
    return { updatedAt: cursor };
  }

  const payload = decodeCursorPayload(cursor);
  if (!isCursorPosition(payload)) {
    throw new BadRequestException('Malformed desktop sync cursor.');
  }
  return { id: payload.id, updatedAt: payload.updatedAt };
}

export function buildCursorWhere(
  position?: DesktopSyncCursorPosition,
): DesktopSyncCursorWhere {
  if (!position) {
    return {};
  }
  const updatedAt = new Date(position.updatedAt);
  if (!position.id) {
    return { updatedAt: { gt: updatedAt } };
  }
  return {
    OR: [
      { updatedAt: { gt: updatedAt } },
      { id: { gt: position.id }, updatedAt },
    ],
  };
}

/**
 * Next keyset position after a page: the last returned row, or the previous
 * position unchanged when the page is empty. The cursor never advances past
 * rows the client has not received — advancing to "now" is what silently
 * dropped rows beyond the page cap.
 */
export function advanceCursorPosition(
  rows: readonly CursorRecord[],
  previous?: DesktopSyncCursorPosition,
): DesktopSyncCursorPosition | undefined {
  const lastRow = rows[rows.length - 1];
  if (!lastRow) {
    return previous;
  }
  return { id: lastRow.id, updatedAt: lastRow.updatedAt.toISOString() };
}
