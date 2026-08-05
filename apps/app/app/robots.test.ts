import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('app robots', () => {
  it('disallows every crawler across the whole studio origin', () => {
    expect(robots()).toEqual({
      rules: {
        disallow: '/',
        userAgent: '*',
      },
      sitemap: 'https://app.genfeed.ai/sitemap.xml',
    });
  });

  it('declares the empty product sitemap', () => {
    expect(robots().sitemap).toBe('https://app.genfeed.ai/sitemap.xml');
  });
});
