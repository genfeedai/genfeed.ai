import { describe, expect, it } from 'vitest';
import { readStringList } from './string-list.util';

describe('readStringList', () => {
  it('returns an empty list for non-arrays', () => {
    expect(readStringList('one')).toEqual([]);
    expect(readStringList(undefined)).toEqual([]);
  });
});
