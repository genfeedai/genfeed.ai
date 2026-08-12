import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('website robots.txt', () => {
  it('allows agent retrieval while reserving training rights', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain(
      'Content-Signal: ai-train=no, search=yes, ai-input=yes',
    );
    expect(body).toContain('User-agent: GPTBot');
    expect(body).toContain('Sitemap: https://genfeed.ai/sitemap.xml');
  });
});
