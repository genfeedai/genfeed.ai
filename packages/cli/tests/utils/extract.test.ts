import { describe, expect, it } from 'vitest';
import { extractString, isRecord } from '../../src/utils/extract';

describe('utils/extract', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('returns false for primitives', () => {
      expect(isRecord('text')).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });
  });

  describe('extractString', () => {
    it('returns undefined when the record is undefined', () => {
      expect(extractString(undefined, 'any')).toBeUndefined();
    });
  });
});
