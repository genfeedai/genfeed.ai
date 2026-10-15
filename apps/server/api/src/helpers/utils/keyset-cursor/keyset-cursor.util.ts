import type { SortObject } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/** Timestamp columns a list can be keyset-paged on, with `id` as tiebreaker. */
export type KeysetSortField = 'createdAt' | 'updatedAt';

export interface KeysetSort {
  direction: 1 | -1;
  field: KeysetSortField;
}

/**
 * Position of the last row a client received. The sort travels with the
 * cursor so a cursor minted under one order can never be replayed under
 * another and silently skip or repeat rows.
 */
export interface KeysetCursorPosition extends KeysetSort {
  id: string;
  value: string;
}

// A type alias (not an interface) so pages satisfy the index-signature shape
// `serializeCollection` accepts.
export type KeysetPage<T> = {
  docs: T[];
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
};

const KEYSET_SORT_FIELDS: readonly KeysetSortField[] = [
  'createdAt',
  'updatedAt',
];

function isKeysetSortField(value: unknown): value is KeysetSortField {
  return (
    typeof value === 'string' &&
    (KEYSET_SORT_FIELDS as readonly string[]).includes(value)
  );
}

/**
 * The keyset order for a parsed `sort`, or `null` when the order cannot be
 * keyset-paged (several keys, or a column that is not a timestamp) and the
 * caller must fall back to offset pagination.
 */
export function resolveKeysetSort(sort: SortObject): KeysetSort | null {
  const entries = Object.entries(sort);
  if (entries.length !== 1) {
    return null;
  }
  const [field, direction] = entries[0];
  if (!isKeysetSortField(field) || (direction !== 1 && direction !== -1)) {
    return null;
  }
  return { direction, field };
}

/** Opaque base64url cursor; clients only ever echo back `nextCursor`. */
export function encodeKeysetCursor(position: KeysetCursorPosition): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

function isCursorPosition(value: unknown): value is KeysetCursorPosition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.value === 'string' &&
    !Number.isNaN(new Date(candidate.value).getTime()) &&
    isKeysetSortField(candidate.field) &&
    (candidate.direction === 1 || candidate.direction === -1)
  );
}

/**
 * Decode a cursor minted for `sort`. Absent → first page. A cursor that does
 * not parse, or was minted for a different order, is rejected rather than
 * silently restarting from the first page.
 */
export function decodeKeysetCursor(
  cursor: string | undefined,
  sort: KeysetSort,
): KeysetCursorPosition | undefined {
  if (!cursor) {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed list cursor.');
  }

  if (
    !isCursorPosition(payload) ||
    payload.field !== sort.field ||
    payload.direction !== sort.direction
  ) {
    throw new BadRequestException('Malformed list cursor.');
  }

  return payload;
}

/**
 * Rows strictly after `position` in `(field, id)` order:
 * `field <= v AND (field < v OR id < cursorId)` (mirrored for ascending).
 * Equivalent to `field < v OR (field = v AND id < cursorId)`, but the leading
 * bound is a range Postgres can seek to in the index, so a deep page reads
 * one page of rows instead of every row before it. The `id` branch keeps rows
 * that share the boundary timestamp from being dropped or repeated.
 */
export function buildKeysetWhere(
  position: KeysetCursorPosition | undefined,
): Record<string, unknown> {
  if (!position) {
    return {};
  }
  const value = new Date(position.value);
  const [bound, strict] =
    position.direction === -1 ? ['lte', 'lt'] : ['gte', 'gt'];
  return {
    AND: [
      { [position.field]: { [bound]: value } },
      {
        OR: [
          { [position.field]: { [strict]: value } },
          { id: { [strict]: position.id } },
        ],
      },
    ],
  };
}

/** `ORDER BY field, id` in the keyset direction. */
export function buildKeysetOrderBy(
  sort: KeysetSort,
): Record<string, 'asc' | 'desc'>[] {
  const direction = sort.direction === -1 ? 'desc' : 'asc';
  return [{ [sort.field]: direction }, { id: direction }];
}

/**
 * Turn a `limit + 1` fetch into a page: trim the probe row and mint the cursor
 * from the last row returned.
 */
export function toKeysetPage<T>(
  rows: T[],
  limit: number,
  sort: KeysetSort,
): KeysetPage<T> {
  const hasMore = rows.length > limit;
  const docs = hasMore ? rows.slice(0, limit) : rows;
  const boundary = readKeysetBoundary(docs.at(-1), sort.field);
  const nextCursor =
    hasMore && boundary
      ? encodeKeysetCursor({ ...sort, id: boundary.id, value: boundary.value })
      : null;

  return { docs, hasMore, limit, nextCursor };
}

function readKeysetBoundary(
  row: unknown,
  field: KeysetSortField,
): { id: string; value: string } | null {
  if (typeof row !== 'object' || row === null) {
    return null;
  }
  const record = row as Record<string, unknown>;
  const id = record.id;
  const raw = record[field];
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  if (!(raw instanceof Date) && typeof raw !== 'string') {
    return null;
  }
  const value = new Date(raw);
  return Number.isNaN(value.getTime())
    ? null
    : { id, value: value.toISOString() };
}
