import { describe, expect, it } from 'vitest';
import { GET } from './robots.txt/route';

describe('app robots', () => {
  it('disallows crawlers everywhere outside the auth entry points', async () => {
    const body = await GET().text();

    expect(body).toContain('Disallow: /');
    expect(body).toContain('Allow: /login');
    expect(body).toContain('Allow: /sign-up');
  });
});
