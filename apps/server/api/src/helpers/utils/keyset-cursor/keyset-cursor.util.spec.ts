import {
  buildKeysetOrderBy,
  buildKeysetWhere,
  decodeKeysetCursor,
  encodeKeysetCursor,
  resolveKeysetSort,
  toKeysetPage,
} from '@api/helpers/utils/keyset-cursor/keyset-cursor.util';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const NEWEST = { direction: -1, field: 'createdAt' } as const;

describe('keyset cursor', () => {
  it('keyset-pages single timestamp sorts and refuses everything else', () => {
    expect(resolveKeysetSort({ createdAt: -1 })).toEqual(NEWEST);
    expect(resolveKeysetSort({ updatedAt: 1 })).toEqual({
      direction: 1,
      field: 'updatedAt',
    });
    expect(resolveKeysetSort({ label: 1 })).toBeNull();
    expect(resolveKeysetSort({ createdAt: -1, label: 1 })).toBeNull();
  });

  it('round-trips a cursor for the order it was minted under', () => {
    const position = {
      ...NEWEST,
      id: 'ing_2',
      value: '2026-10-15T10:00:00.000Z',
    };

    expect(decodeKeysetCursor(encodeKeysetCursor(position), NEWEST)).toEqual(
      position,
    );
    expect(decodeKeysetCursor(undefined, NEWEST)).toBeUndefined();
  });

  it('rejects malformed cursors and cursors minted for another order', () => {
    const oldest = encodeKeysetCursor({
      direction: 1,
      field: 'createdAt',
      id: 'ing_2',
      value: '2026-10-15T10:00:00.000Z',
    });

    expect(() => decodeKeysetCursor('not-a-cursor', NEWEST)).toThrow(
      BadRequestException,
    );
    expect(() => decodeKeysetCursor(oldest, NEWEST)).toThrow(
      BadRequestException,
    );
  });

  it('continues strictly after the boundary row, breaking timestamp ties by id', () => {
    const value = '2026-10-15T10:00:00.000Z';

    expect(buildKeysetWhere({ ...NEWEST, id: 'ing_2', value })).toEqual({
      AND: [
        { createdAt: { lte: new Date(value) } },
        {
          OR: [{ createdAt: { lt: new Date(value) } }, { id: { lt: 'ing_2' } }],
        },
      ],
    });
    expect(
      buildKeysetWhere({ direction: 1, field: 'updatedAt', id: 'b', value }),
    ).toEqual({
      AND: [
        { updatedAt: { gte: new Date(value) } },
        { OR: [{ updatedAt: { gt: new Date(value) } }, { id: { gt: 'b' } }] },
      ],
    });
    expect(buildKeysetWhere(undefined)).toEqual({});
    expect(buildKeysetOrderBy(NEWEST)).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('trims the probe row and mints the next cursor from the last row kept', () => {
    const rows = [
      { createdAt: new Date('2026-10-15T10:02:00.000Z'), id: 'c' },
      { createdAt: new Date('2026-10-15T10:01:00.000Z'), id: 'b' },
      { createdAt: new Date('2026-10-15T10:00:00.000Z'), id: 'a' },
    ];

    const page = toKeysetPage(rows, 2, NEWEST);

    expect(page.docs.map((row) => row.id)).toEqual(['c', 'b']);
    expect(page.hasMore).toBe(true);
    expect(decodeKeysetCursor(page.nextCursor ?? undefined, NEWEST)).toEqual({
      ...NEWEST,
      id: 'b',
      value: '2026-10-15T10:01:00.000Z',
    });

    const last = toKeysetPage(rows, 3, NEWEST);
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });
});
