import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/constants';
import { describe, expect, it, vi } from 'vitest';
import config from './next.config';

vi.mock('@next/bundle-analyzer', () => ({
  default: () => (nextConfig: Record<string, unknown>) => nextConfig,
}));

describe('app next.config', () => {
  it('allows current social-provider avatars without retaining Clerk hosts', () => {
    const hostnames = config.images?.remotePatterns?.map((pattern) =>
      pattern instanceof URL ? pattern.hostname : pattern.hostname,
    );

    expect(hostnames).toEqual(
      expect.arrayContaining([
        'avatars.githubusercontent.com',
        'lh3.googleusercontent.com',
      ]),
    );
    expect(hostnames?.some((hostname) => hostname.includes('clerk'))).toBe(
      false,
    );
  });

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
      (redirect) => redirect.source === APP_ROUTES.WORKSPACE.INBOX,
    );

    expect(inboxRedirect).toEqual({
      destination: APP_ROUTES.WORKSPACE.INBOX_UNREAD,
      permanent: false,
      source: APP_ROUTES.WORKSPACE.INBOX,
    });
  });

  it('redirects org/brand-scoped /:orgSlug/:brandSlug/workspace/inbox to its unread view', async () => {
    const redirects = await config.redirects?.();
    const scopedInboxRedirect = redirects?.find(
      (redirect) =>
        redirect.source ===
        createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          APP_ROUTES.WORKSPACE.INBOX,
        ),
    );

    expect(scopedInboxRedirect).toEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.WORKSPACE.INBOX_UNREAD,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.WORKSPACE.INBOX,
      ),
    });
  });

  it('redirects legacy Library ingredients routes to the library home', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination: APP_ROUTES.LIBRARY.ROOT,
      permanent: false,
      source: APP_ROUTES.LIBRARY.INGREDIENTS,
    });
    expect(redirects).toContainEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.ROOT,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.INGREDIENTS,
      ),
    });
  });

  it.each([
    APP_ROUTES.ORCHESTRATION.ROOT,
    APP_ROUTES.WORKSPACE.ROOT,
    APP_ROUTES.LIBRARY.ROOT,
    APP_ROUTES.ANALYTICS.ROOT,
  ] as const)(
    'permanently redirects %s/overview to the app home',
    async (appRoot) => {
      const redirects = await config.redirects?.();
      const overviewPath = `${appRoot}/overview`;

      expect(redirects).toContainEqual({
        destination: appRoot,
        permanent: true,
        source: overviewPath,
      });
      expect(redirects).toContainEqual({
        destination: createBrandAppRoute(':orgSlug', ':brandSlug', appRoot),
        permanent: true,
        source: createBrandAppRoute(':orgSlug', ':brandSlug', overviewPath),
      });
    },
  );

  it('does not redirect app roots into a nested overview home', async () => {
    const redirects = await config.redirects?.();

    expect(
      redirects?.some(
        (redirect) =>
          redirect.source === APP_ROUTES.LIBRARY.ROOT &&
          redirect.destination.includes('/overview'),
      ),
    ).toBe(false);
    expect(
      redirects?.some(
        (redirect) =>
          redirect.source === APP_ROUTES.ANALYTICS.ROOT &&
          redirect.destination.includes('/overview'),
      ),
    ).toBe(false);
  });

  it('permanently hard-cuts Automate campaign routes into Publish', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination: APP_ROUTES.POSTS.CAMPAIGNS,
      permanent: true,
      source: '/orchestration/campaigns',
    });
    expect(redirects).toContainEqual({
      destination: `${APP_ROUTES.POSTS.CAMPAIGNS}/:path*`,
      permanent: true,
      source: '/orchestration/campaigns/:path*',
    });
    expect(redirects).toContainEqual({
      destination: APP_ROUTES.POSTS.OUTREACH_CAMPAIGNS,
      permanent: true,
      source: '/orchestration/outreach-campaigns',
    });
    expect(redirects).toContainEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.POSTS.CAMPAIGNS,
      ),
      permanent: true,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        '/orchestration/campaigns',
      ),
    });
  });

  it('permanently hard-cuts legacy /workflows into Automate workflows', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination: APP_ROUTES.ORCHESTRATION.WORKFLOWS,
      permanent: true,
      source: '/workflows',
    });
    expect(redirects).toContainEqual({
      destination: `${APP_ROUTES.ORCHESTRATION.WORKFLOWS}/:path*`,
      permanent: true,
      source: '/workflows/:path*',
    });
    expect(redirects).toContainEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.ORCHESTRATION.WORKFLOWS,
      ),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', '/workflows'),
    });
  });

  it('rewrites clean local workspace routes into the default local shell scope', async () => {
    const rewrites = await config.rewrites?.();
    expect(rewrites).toContainEqual({
      destination: '/default/default/workspace/:path*',
      source: '/workspace/:path*',
    });
    expect(rewrites).toContainEqual({
      destination: '/default/default/agent/:path*',
      source: '/agent/:path*',
    });
    expect(rewrites).toContainEqual({
      destination: '/default/~/settings/:path*',
      source: '/settings/:path*',
    });
  });

  it('does not redirect brand-scoped agent routes back to org scope', async () => {
    const redirects = await config.redirects?.();

    expect(
      redirects?.some(
        (redirect) =>
          redirect.source === '/:orgSlug/:brandSlug([^~/][^/]*)/agent/:path*' &&
          redirect.destination === '/:orgSlug/~/agent/:path*',
      ),
    ).toBe(false);
  });

  it('redirects org-scoped /research to /research/discovery', async () => {
    const redirects = await config.redirects?.();
    const researchRedirect = redirects?.find(
      (redirect) =>
        redirect.source ===
        createBrandAppRoute(':orgSlug', ':brandSlug', APP_ROUTES.RESEARCH.ROOT),
    );

    expect(researchRedirect).toEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.RESEARCH.DISCOVERY,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.RESEARCH.ROOT,
      ),
    });
  });

  it('redirects /studio to /studio/image only', async () => {
    const redirects = await config.redirects?.();
    const studioRedirect = redirects?.find(
      (redirect) => redirect.source === APP_ROUTES.STUDIO.ROOT,
    );

    expect(studioRedirect).toEqual({
      destination: APP_ROUTES.STUDIO.IMAGE,
      permanent: false,
      source: APP_ROUTES.STUDIO.ROOT,
    });
  });

  it('does not define a broad studio wildcard redirect', async () => {
    const redirects = await config.redirects?.();
    const studioRedirects = redirects?.filter((redirect) =>
      redirect.source.startsWith(APP_ROUTE_PREFIXES.STUDIO),
    );

    expect(studioRedirects).toEqual([
      {
        destination: APP_ROUTES.STUDIO.IMAGE,
        permanent: false,
        source: APP_ROUTES.STUDIO.ROOT,
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
