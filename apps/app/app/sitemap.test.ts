import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

describe('app sitemap', () => {
  it('lists only the two indexable auth entry points', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      'https://app.genfeed.ai/login',
      'https://app.genfeed.ai/sign-up',
    ]);
  });

  it('contains no authenticated product URLs', () => {
    const authenticatedPaths = ['/dashboard', '/studio', '/settings', '/admin'];

    for (const entry of sitemap()) {
      for (const path of authenticatedPaths) {
        expect(entry.url).not.toContain(path);
      }
    }
  });
});
