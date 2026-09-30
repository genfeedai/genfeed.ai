import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  advanceCursorPosition,
  buildCursorWhere,
  decodeManifestCursor,
  decodeThreadCursor,
  encodeManifestCursor,
  encodeThreadCursor,
} from './desktop-sync-cursor.util';

describe('desktop-sync-cursor.util', () => {
  describe('manifest cursor', () => {
    it('round-trips per-collection composite positions', () => {
      const positions = {
        assets: { id: 'asset-9', updatedAt: '2026-05-01T10:00:00.000Z' },
        brands: { id: 'brand-3', updatedAt: '2026-05-01T09:00:00.000Z' },
        ingredients: { id: 'ing-7', updatedAt: '2026-05-01T08:00:00.000Z' },
      };

      expect(decodeManifestCursor(encodeManifestCursor(positions))).toEqual(
        positions,
      );
    });

    it('round-trips partial positions and preserves missing collections', () => {
      const positions = {
        assets: { id: 'asset-9', updatedAt: '2026-05-01T10:00:00.000Z' },
      };

      expect(decodeManifestCursor(encodeManifestCursor(positions))).toEqual(
        positions,
      );
    });

    it('returns empty positions when no cursor is provided', () => {
      expect(decodeManifestCursor(undefined)).toEqual({});
      expect(decodeManifestCursor('')).toEqual({});
    });

    it('maps a legacy plain-ISO cursor onto every collection without an id', () => {
      const legacy = '2026-05-01T09:00:00.000Z';

      expect(decodeManifestCursor(legacy)).toEqual({
        assets: { updatedAt: legacy },
        brands: { updatedAt: legacy },
        ingredients: { updatedAt: legacy },
      });
    });

    it('rejects malformed cursors with a 400', () => {
      expect(() => decodeManifestCursor('9999-99-99Tnot-a-date')).toThrow(
        BadRequestException,
      );
      expect(() => decodeManifestCursor('!!not-base64url!!')).toThrow(
        BadRequestException,
      );
      const wrongShape = Buffer.from(
        JSON.stringify({ assets: { id: 42 } }),
        'utf8',
      ).toString('base64url');
      expect(() => decodeManifestCursor(wrongShape)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('thread cursor', () => {
    it('round-trips a composite position', () => {
      const position = {
        id: 'thread-5',
        updatedAt: '2026-05-01T11:00:00.000Z',
      };

      expect(decodeThreadCursor(encodeThreadCursor(position))).toEqual(
        position,
      );
    });

    it('accepts a legacy plain-ISO cursor without an id', () => {
      expect(decodeThreadCursor('2026-05-01T09:00:00.000Z')).toEqual({
        updatedAt: '2026-05-01T09:00:00.000Z',
      });
    });

    it('returns undefined when no cursor is provided', () => {
      expect(decodeThreadCursor(undefined)).toBeUndefined();
      expect(decodeThreadCursor('')).toBeUndefined();
    });

    it('rejects malformed cursors with a 400', () => {
      expect(() => decodeThreadCursor('!!not-base64url!!')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildCursorWhere', () => {
    it('returns no filter without a position', () => {
      expect(buildCursorWhere(undefined)).toEqual({});
    });

    it('falls back to a strict updatedAt bound for legacy positions', () => {
      expect(
        buildCursorWhere({ updatedAt: '2026-05-01T09:00:00.000Z' }),
      ).toEqual({
        updatedAt: { gt: new Date('2026-05-01T09:00:00.000Z') },
      });
    });

    it('tie-breaks equal updatedAt rows by id for composite positions', () => {
      expect(
        buildCursorWhere({
          id: 'row-42',
          updatedAt: '2026-05-01T09:00:00.000Z',
        }),
      ).toEqual({
        OR: [
          { updatedAt: { gt: new Date('2026-05-01T09:00:00.000Z') } },
          {
            id: { gt: 'row-42' },
            updatedAt: new Date('2026-05-01T09:00:00.000Z'),
          },
        ],
      });
    });
  });

  describe('advanceCursorPosition', () => {
    it('advances to the last returned row', () => {
      const rows = [
        { id: 'row-1', updatedAt: new Date('2026-05-01T09:00:00.000Z') },
        { id: 'row-2', updatedAt: new Date('2026-05-01T09:00:00.000Z') },
      ];

      expect(
        advanceCursorPosition(rows, {
          id: 'row-0',
          updatedAt: '2026-05-01T08:00:00.000Z',
        }),
      ).toEqual({ id: 'row-2', updatedAt: '2026-05-01T09:00:00.000Z' });
    });

    it('keeps the previous position on an empty page', () => {
      const previous = { id: 'row-0', updatedAt: '2026-05-01T08:00:00.000Z' };

      expect(advanceCursorPosition([], previous)).toEqual(previous);
      expect(advanceCursorPosition([], undefined)).toBeUndefined();
    });
  });
});
