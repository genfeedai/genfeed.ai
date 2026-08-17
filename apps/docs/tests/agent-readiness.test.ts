import { describe, expect, it } from 'vitest';
import { GET as getAgentContent } from '../app/.well-known/agent-content/home/route';
import { GET as getRobots } from '../app/robots.txt/route';
import config from '../next.config.mjs';

describe('docs agent readiness', () => {
  it('serves pre-optimized CDN images without Vercel transformations', () => {
    expect(config.images?.unoptimized).toBe(true);
  });

  it('advertises its sitemap and markdown index in response headers', async () => {
    const headers = await config.headers?.();
    const rootHeaders = headers?.find((entry) => entry.source === '/(.*)');

    expect(rootHeaders?.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'Link',
          value: expect.stringContaining(
            '<https://docs.genfeed.ai/llms.txt>; rel="describedby"',
          ),
        }),
        {
          key: 'Content-Signal',
          value: 'ai-train=no, search=yes, ai-input=yes',
        },
      ]),
    );
  });

  it('negotiates the docs index as markdown', async () => {
    const rewrites = await config.rewrites?.();

    expect(rewrites).toContainEqual({
      destination: '/.well-known/agent-content/home',
      has: [
        {
          key: 'accept',
          type: 'header',
          value: '.*text/markdown.*',
        },
      ],
      source: '/',
    });

    const response = getAgentContent();
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(await response.text()).toContain('# Genfeed.ai Docs');
  });

  it('allows agent input and search while reserving training rights', async () => {
    const response = getRobots();
    const body = await response.text();

    expect(body).toContain(
      'Content-Signal: ai-train=no, search=yes, ai-input=yes',
    );
    expect(body).toContain('Sitemap: https://docs.genfeed.ai/sitemap.xml');
  });
});
