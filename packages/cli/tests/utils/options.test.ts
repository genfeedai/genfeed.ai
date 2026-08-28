import { describe, expect, it } from 'vitest';
import { parsePositiveInteger } from '../../src/utils/options';

describe('CLI option parsers', () => {
  it.each([
    ['1', 1],
    ['25', 25],
    [' 100 ', 100],
  ])('parses positive integer %s', (value, expected) => {
    expect(parsePositiveInteger(value)).toBe(expected);
  });

  it.each(['abc', '20items', '1.5', '0', '-1', '9007199254740992'])(
    'rejects invalid positive integer %s',
    (value) => {
      expect(() => parsePositiveInteger(value)).toThrow('Invalid positive integer');
    }
  );
});
