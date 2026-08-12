import { describe, expect, it } from 'vitest';
import config from './next.config';

describe('website next.config', () => {
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
  });

  it('delegates OAuth discovery to the canonical API resource hosts', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          destination:
            'https://api.genfeed.ai/.well-known/oauth-authorization-server',
          permanent: false,
          source: '/.well-known/oauth-authorization-server',
        },
        {
          destination:
            'https://mcp.genfeed.ai/.well-known/oauth-protected-resource',
          permanent: false,
          source: '/.well-known/oauth-protected-resource',
        },
      ]),
    );
  });
});
