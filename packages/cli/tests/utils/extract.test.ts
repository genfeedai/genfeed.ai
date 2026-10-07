import { describe, expect, it } from 'vitest';
import { extractString } from '../../src/utils/extract';

describe('utils/extract', () => {
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
