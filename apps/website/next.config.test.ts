import { describe, expect, it } from 'vitest';
import config from './next.config';

describe('website next.config', () => {
  it('serves pre-optimized CDN images without Vercel transformations', () => {
    expect(config.images?.unoptimized).toBe(true);
  });

  it('aliases @genfeedai/contracts to the package index, not the enums file', () => {
    expect(config.turbopack?.resolveAlias).toMatchObject({
      '@genfeedai/contracts': '../../packages/contracts/src/index.ts',
      '@genfeedai/contracts/constants':
        '../../packages/contracts/src/constants/index.ts',
      '@genfeedai/contracts/interfaces':
        '../../packages/contracts/src/interfaces/index.ts',
    });
    expect(
      config.turbopack?.resolveAlias?.['@genfeedai/contracts'],
    ).not.toContain('enums/index.ts');
  });

  it('reserves training rights while allowing search and agent input', async () => {
    const headers = await config.headers?.();
    const rootHeaders = headers?.find((entry) => entry.source === '/(.*)');

    expect(rootHeaders?.headers).toContainEqual({
      key: 'Content-Signal',
      value: 'ai-train=no, search=yes, ai-input=yes',
    });
  });

  it('negotiates markdown for the homepage when an agent requests it', async () => {
    const rewrites = await config.rewrites?.();

    expect(rewrites).toEqual({
      afterFiles: [],
      beforeFiles: [
        {
          destination: '/.well-known/agent-content/home',
          has: [
            {
              key: 'accept',
              type: 'header',
              value: '.*text/markdown.*',
            },
          ],
          source: '/',
        },
      ],
      fallback: [],
    });
  });

  it('varies the negotiated homepage response by Accept', async () => {
    const headers = await config.headers?.();
    const negotiatedHeaders = headers?.find(
      (entry) =>
        entry.source === '/' &&
        entry.has?.some(
          (condition) => 'key' in condition && condition.key === 'accept',
        ),
    );

    expect(negotiatedHeaders?.headers).toContainEqual({
      key: 'Vary',
      value: expect.stringContaining('Accept'),
    });
  });

  it('publishes the canonical OpenAPI document from the website origin', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination: 'https://api.genfeed.ai/v1/openapi.json',
      permanent: false,
      source: '/openapi.json',
    });
  });

  it('delegates authorization-server discovery without redirecting origin-bound resource metadata', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination:
        'https://api.genfeed.ai/.well-known/oauth-authorization-server',
      permanent: false,
      source: '/.well-known/oauth-authorization-server',
    });
    expect(redirects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/.well-known/oauth-protected-resource',
        }),
      ]),
    );
  });
});
