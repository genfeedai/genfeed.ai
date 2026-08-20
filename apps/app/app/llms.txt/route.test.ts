import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('app llms.txt', () => {
  it('satisfies the llmstxt.org shape: one H1 and at least one link', async () => {
    const body = await GET().text();

    expect(body.split('\n')[0]).toBe('# Genfeed Studio');
    expect(body.match(/^# /gm)).toHaveLength(1);
    expect(body).toMatch(/\[[^\]]+\]\(https:\/\/[^)]+\)/);
  });

  it('points agents at the origins that actually hold public content', async () => {
    const body = await GET().text();

    expect(body).toContain('https://genfeed.ai/llms.txt');
    expect(body).toContain('https://docs.genfeed.ai');
  });

  it('advertises only the two crawlable studio routes', async () => {
    const body = await GET().text();

    expect(body).toContain('https://app.genfeed.ai/login');
    expect(body).toContain('https://app.genfeed.ai/sign-up');
  });

  it('is served as cacheable plain text', () => {
    const response = GET();

    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(response.headers.get('Cache-Control')).toContain('max-age=3600');
  });
});
