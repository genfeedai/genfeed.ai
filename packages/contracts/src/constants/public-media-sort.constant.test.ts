import { describe, expect, it } from 'vitest';
import { parsePublicMediaSort } from './public-media-sort.constant';

describe('parsePublicMediaSort', () => {
  it.each([
    ['newest', 'newest'],
    ['views', 'views'],
    ['recreations', 'recreations'],
    ['createdAt: -1', 'newest'],
    ['VIEWS', 'newest'],
    ['', 'newest'],
    [null, 'newest'],
    [undefined, 'newest'],
  ])('reads %j as %j', (value, expected) => {
    expect(parsePublicMediaSort(value)).toBe(expected);
  });
});
