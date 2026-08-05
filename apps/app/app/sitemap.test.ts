import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

describe('app sitemap', () => {
  it('contains no authenticated product URLs', () => {
    expect(sitemap()).toEqual([]);
  });
});
