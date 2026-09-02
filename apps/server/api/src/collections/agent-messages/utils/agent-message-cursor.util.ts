import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

/**
 * Keyset position of a message row: the exact `(createdAt, id)` tuple the
 * client last received. Both fields are required — `AgentMessage.createdAt`
 * is not unique (bulk writes and fast turns land in the same millisecond),
 * so `createdAt` alone cannot totally order the thread. `id` (a cuid, which
 * is lexicographically sortable within a fixed timestamp bucket but not
 * across the whole table) breaks ties only among rows sharing one
 * `createdAt` instant.
 */
export interface AgentMessageCursorPosition {
  id: string;
  createdAt: string;
}

/**
 * Prisma `where` fragment selecting rows strictly older than `position` in
 * `(createdAt desc, id desc)` order. Rows must be fetched with
 * `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` for the keyset to be
 * lossless across `createdAt` ties.
 */
type AgentMessageCursorWhere = Pick<Prisma.AgentMessageWhereInput, 'OR'>;

function isCursorPosition(value: unknown): value is AgentMessageCursorPosition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return false;
  }
  if (typeof candidate.createdAt !== 'string') {
    return false;
  }
  return !Number.isNaN(new Date(candidate.createdAt).getTime());
}

/**
 * Encode a message cursor position as an opaque base64url string. Opaque so
 * callers never construct or parse the cursor themselves — only walk it
 * forward via the value returned as `nextCursor`.
 */
export function encodeAgentMessageCursor(
  position: AgentMessageCursorPosition,
): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

/**
 * Decode a message cursor. Returns `undefined` for an absent cursor (first
 * page) and throws `BadRequestException` for a cursor that fails to decode
 * or parse — never silently falls back to an unscoped/first-page query.
 */
export function decodeAgentMessageCursor(
  cursor?: string,
): AgentMessageCursorPosition | undefined {
  if (!cursor) {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed agent message cursor.');
  }

  if (!isCursorPosition(payload)) {
    throw new BadRequestException('Malformed agent message cursor.');
  }

  return { createdAt: payload.createdAt, id: payload.id };
}

/**
 * Build the composite tiebreaker `where` fragment for "older than
 * `position`" under `(createdAt desc, id desc)` ordering:
 * `createdAt < position.createdAt` OR
 * `(createdAt = position.createdAt AND id < position.id)`.
 *
 * The second branch is what a single-field `createdAt: { lt }` filter is
 * missing — without it, any row sharing the exact cursor timestamp but
 * ordered after the cursor row (lower id) is silently dropped, and any row
 * sharing the timestamp but ordered before it (higher id, already returned)
 * would be re-included on the next page.
 */
export function buildAgentMessageCursorWhere(
  position?: AgentMessageCursorPosition,
): AgentMessageCursorWhere {
  if (!position) {
    return {};
  }
  const createdAt = new Date(position.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: position.id } },
    ],
  };
}
