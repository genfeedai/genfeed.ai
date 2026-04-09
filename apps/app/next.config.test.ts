import { describe, expect, it, vi } from 'vitest';
import config from './next.config';

vi.mock('@next/bundle-analyzer', () => ({
  default: () => (nextConfig: Record<string, unknown>) => nextConfig,
}));

describe('app next.config redirects', () => {
  it('does not define stale bare overview redirects', async () => {
    const redirects = await config.redirects?.();
    expect(redirects?.some((redirect) => redirect.source === '/')).toBe(false);
    expect(
      redirects?.some((redirect) => redirect.source === '/workspace'),
    ).toBe(false);
    expect(redirects?.some((redirect) => redirect.source === '/overview')).toBe(
      false,
    );
  });

  it('redirects /workspace/inbox to /workspace/inbox/unread', async () => {
    const redirects = await config.redirects?.();
    const inboxRedirect = redirects?.find(
      (redirect) => redirect.source === '/workspace/inbox',
    );

    expect(inboxRedirect).toEqual({
      destination: '/workspace/inbox/unread',
      permanent: false,
      source: '/workspace/inbox',
    });
  });

  it('rewrites clean local workspace routes into the default local shell scope', async () => {
    const rewrites = await config.rewrites?.();
    expect(rewrites).toContainEqual({
      destination: '/default/default/workspace/:path*',
      source: '/workspace/:path*',
    });
    expect(rewrites).toContainEqual({
      destination: '/default/~/settings/:path*',
      source: '/settings/:path*',
    });
  });

  it('redirects org-scoped /research to /research/discovery', async () => {
    const redirects = await config.redirects?.();
    const researchRedirect = redirects?.find(
      (redirect) => redirect.source === '/:orgSlug/:brandSlug/research',
    );

    expect(researchRedirect).toEqual({
      destination: '/:orgSlug/:brandSlug/research/discovery',
      permanent: false,
      source: '/:orgSlug/:brandSlug/research',
    });
  });

  it('redirects /studio to /studio/image only', async () => {
    const redirects = await config.redirects?.();
    const studioRedirect = redirects?.find(
      (redirect) => redirect.source === '/studio',
    );

    expect(studioRedirect).toEqual({
      destination: '/studio/image',
      permanent: false,
      source: '/studio',
    });
  });

  it('does not define a broad studio wildcard redirect', async () => {
    const redirects = await config.redirects?.();
    const studioRedirects = redirects?.filter((redirect) =>
      redirect.source.startsWith('/studio'),
    );

    expect(studioRedirects).toEqual([
      {
        destination: '/studio/image',
        permanent: false,
        source: '/studio',
      },
    ]);
  });

  it('aliases published serializers to the local workspace source', () => {
    expect(config.turbopack?.resolveAlias).toMatchObject({
      '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
      '@serializers': '../../packages/serializers/src',
    });
  });

  it('adds the same serializers aliases to webpack resolution', () => {
    const webpackConfig = config.webpack?.(
      {
        resolve: {
          alias: {},
          extensions: ['.js'],
        },
      },
      {} as never,
    );

    expect(webpackConfig?.resolve?.alias).toMatchObject({
      '@genfeedai/serializers': expect.stringContaining(
        'packages/serializers/src/index.ts',
      ),
      '@serializers': expect.stringContaining('packages/serializers/src'),
    });
  });
});
