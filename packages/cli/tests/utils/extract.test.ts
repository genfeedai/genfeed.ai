import { describe, expect, it } from 'vitest';
import { extractString, isRecord } from '../../src/utils/extract';

describe('utils/extract', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isRecord([1, 2])).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isRecord('text')).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });
  });

  describe('extractString', () => {
    it('returns string values by key', () => {
      expect(extractString({ name: 'gf' }, 'name')).toBe('gf');
    });

    it('returns undefined for non-string values', () => {
      expect(extractString({ count: 3 }, 'count')).toBeUndefined();
      expect(extractString({ flag: true }, 'flag')).toBeUndefined();
      expect(extractString({ nested: {} }, 'nested')).toBeUndefined();
    });

    it('returns undefined for missing keys', () => {
      expect(extractString({}, 'missing')).toBeUndefined();
    });

    it('returns undefined when the record is undefined', () => {
      expect(extractString(undefined, 'any')).toBeUndefined();
    });
  });
});
