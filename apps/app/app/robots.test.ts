import { describe, expect, it } from 'vitest';
import { GET } from './robots.txt/route';

describe('app robots', () => {
  it('disallows every crawler across the whole studio origin', async () => {
    const response = GET();

    await expect(response.text()).resolves.toContain('Disallow: /');
  });

  it('serves the static policy as cacheable plain text', () => {
    const response = GET();

    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    );
  });
});
