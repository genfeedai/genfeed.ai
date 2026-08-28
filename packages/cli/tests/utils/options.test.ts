import { describe, expect, it } from 'vitest';
import { parseInteger, parseIntegerInRange, parsePositiveInteger } from '@/utils/options';

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

  it.each([
    ['0', 0],
    ['-42', -42],
    ['123', 123],
  ])('parses safe integer %s', (value, expected) => {
    expect(parseInteger(value)).toBe(expected);
  });

  it.each(['abc', '1.5', '9007199254740992'])('rejects invalid safe integer %s', (value) => {
    expect(() => parseInteger(value)).toThrow('Invalid integer');
  });

  it.each([
    ['1', 1],
    ['4', 4],
  ])('parses bounded integer %s', (value, expected) => {
    expect(parseIntegerInRange(value, 1, 4)).toBe(expected);
  });

  it.each(['0', '5'])('rejects out-of-range integer %s', (value) => {
    expect(() => parseIntegerInRange(value, 1, 4)).toThrow('between 1 and 4');
  });

  it('rejects a non-integer before range validation', () => {
    expect(() => parseIntegerInRange('1.5', 1, 4)).toThrow('Invalid integer');
  });
});
