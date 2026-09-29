import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

describe('app sitemap', () => {
  it('contains no authenticated product URLs', () => {
    const authenticatedPaths = ['/dashboard', '/studio', '/settings', '/admin'];

    for (const entry of sitemap()) {
      for (const path of authenticatedPaths) {
        expect(entry.url).not.toContain(path);
      }
    }
  });
});
