import { describe, expect, it } from 'vitest';
import { readStringList } from './string-list.util';

describe('readStringList', () => {
  it('keeps trimmed non-empty strings and drops everything else', () => {
    expect(readStringList(['  one  ', '', 'two', 3, null])).toEqual([
      'one',
      'two',
    ]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(readStringList('one')).toEqual([]);
    expect(readStringList(undefined)).toEqual([]);
  });
});
