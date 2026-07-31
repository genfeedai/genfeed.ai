import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('app robots', () => {
  it('disallows every crawler across the whole studio origin', () => {
    expect(robots()).toEqual({
      rules: {
        disallow: '/',
        userAgent: '*',
      },
    });
  });

  it('publishes no sitemap for the studio', () => {
    expect(robots().sitemap).toBeUndefined();
  });
});
