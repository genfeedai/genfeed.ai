import {
  buildAgentMessageCursorWhere,
  decodeAgentMessageCursor,
  encodeAgentMessageCursor,
} from '@api/collections/agent-messages/utils/agent-message-cursor.util';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('agent-message-cursor.util', () => {
  describe('encode/decode round trip', () => {
    it('decodes exactly what it encoded', () => {
      const position = { createdAt: '2026-06-01T10:00:00.000Z', id: 'msg-5' };
      const cursor = encodeAgentMessageCursor(position);

      expect(decodeAgentMessageCursor(cursor)).toEqual(position);
    });

    it('returns undefined for an absent cursor (first page)', () => {
      expect(decodeAgentMessageCursor(undefined)).toBeUndefined();
      expect(decodeAgentMessageCursor('')).toBeUndefined();
    });

    it('rejects a cursor that is not valid base64url JSON', () => {
      expect(() => decodeAgentMessageCursor('not-a-cursor')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a cursor missing the id tiebreaker', () => {
      const bare = Buffer.from(
        JSON.stringify({ createdAt: '2026-06-01T10:00:00.000Z' }),
        'utf8',
      ).toString('base64url');

      expect(() => decodeAgentMessageCursor(bare)).toThrow(BadRequestException);
    });

    it('rejects a cursor with an unparseable createdAt', () => {
      const malformed = Buffer.from(
        JSON.stringify({ createdAt: 'not-a-date', id: 'msg-5' }),
        'utf8',
      ).toString('base64url');

      expect(() => decodeAgentMessageCursor(malformed)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildAgentMessageCursorWhere', () => {
    it('returns an empty fragment for the first page (no cursor)', () => {
      expect(buildAgentMessageCursorWhere(undefined)).toEqual({});
    });

    it('builds a composite OR fragment: createdAt < cursor OR (createdAt = cursor AND id < cursor.id)', () => {
      const where = buildAgentMessageCursorWhere({
        createdAt: '2026-06-01T10:00:00.000Z',
        id: 'msg-5',
      });

      expect(where).toEqual({
        OR: [
          { createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') } },
          {
            createdAt: new Date('2026-06-01T10:00:00.000Z'),
            id: { lt: 'msg-5' },
          },
        ],
      });
    });

    it('never filters solely on createdAt, so same-millisecond siblings are not silently dropped', () => {
      // The regression this guards: a `createdAt: { lt }`-only filter drops
      // any row sharing the cursor's exact timestamp with a lower id, since
      // that row is neither `< cursor.createdAt` nor selected by any other
      // clause. The fragment must always carry an `id` tiebreaker branch.
      const where = buildAgentMessageCursorWhere({
        createdAt: '2026-06-01T10:00:00.000Z',
        id: 'msg-5',
      });

      expect(where.OR).toBeDefined();
      expect(where.OR).toHaveLength(2);
      expect(where.OR?.[1]).toMatchObject({ id: { lt: 'msg-5' } });
      // The naive single-field filter this replaces would look like this,
      // and must not be what we produce:
      expect(where).not.toEqual({
        createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') },
      });
    });
  });
});
