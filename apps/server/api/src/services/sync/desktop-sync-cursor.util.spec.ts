import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  advanceCursorPosition,
  decodeManifestCursor,
  decodeThreadCursor,
  encodeThreadCursor,
} from './desktop-sync-cursor.util';

describe('desktop-sync-cursor.util', () => {
  describe('manifest cursor', () => {
    it('returns empty positions when no cursor is provided', () => {
      expect(decodeManifestCursor(undefined)).toEqual({});
      expect(decodeManifestCursor('')).toEqual({});
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

  describe('advanceCursorPosition', () => {
    it('keeps the previous position on an empty page', () => {
      const previous = { id: 'row-0', updatedAt: '2026-05-01T08:00:00.000Z' };

      expect(advanceCursorPosition([], previous)).toEqual(previous);
      expect(advanceCursorPosition([], undefined)).toBeUndefined();
    });
  });
});
