import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('app robots.txt', () => {
  it('keeps the authenticated product private from crawlers and content reuse', async () => {
    const response = GET();
    const body = await response.text();

    expect(body).toContain('Disallow: /');
    expect(body).toContain('Content-Signal: ai-train=no, ai-input=no');
    expect(body).toContain('Sitemap: https://app.genfeed.ai/sitemap.xml');
  });

  it('opens only the two auth entry points to crawlers', async () => {
    const response = GET();
    const body = await response.text();

    expect(body).toContain('Allow: /login');
    expect(body).toContain('Allow: /sign-up');
    // Those pages are meant to rank, so the origin no longer declares search=no.
    expect(body).not.toContain('search=no');
  });
});
