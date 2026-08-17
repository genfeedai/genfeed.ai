import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('app robots.txt', () => {
  it('keeps the authenticated product private from crawlers and content reuse', async () => {
    const response = GET();
    const body = await response.text();

    expect(body).toContain('Disallow: /');
    expect(body).toContain(
      'Content-Signal: ai-train=no, search=no, ai-input=no',
    );
    expect(body).toContain('Sitemap: https://app.genfeed.ai/sitemap.xml');
  });
});
