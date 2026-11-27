import { describe, expect, it } from 'vitest';
import { needsPostAttention } from './post-attention.helpers';

describe('needsPostAttention', () => {
  it.each([
    ['failed', true],
    ['FAILED', true],
    ['scheduled', false],
    ['cancelled', false],
    ['draft', false],
    ['published', false],
    [undefined, false],
    [null, false],
  ])('for status %s returns %s', (status, expected) => {
    expect(needsPostAttention(status)).toBe(expected);
  });
});
