import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/constants';
import { isCsrfOriginAllowed } from 'next/dist/server/app-render/csrf-protection.js';
import { describe, expect, it } from 'vitest';
import config from './next.config';

describe('app next.config', () => {
  describe('allowedDevOrigins', () => {
    // Next runs the configured patterns through this exact matcher before it
    // serves any `/_next/*` dev resource. A rejected origin 403s the dev
    // runtime, so hydration never starts and the app renders a blank shell.
    const isAllowed = (host: string) =>
      isCsrfOriginAllowed(host, config.allowedDevOrigins ?? []);

    it('allows the plain Portless service hosts', () => {
      expect(isAllowed('app.genfeed.localhost')).toBe(true);
      expect(isAllowed('api.genfeed.localhost')).toBe(true);
      expect(isAllowed('genfeed.localhost')).toBe(true);
    });

    it('allows branch-prefixed Portless hosts used by linked worktrees', () => {
      expect(isAllowed('qa-train-2026-07-31.app.genfeed.localhost')).toBe(true);
      expect(isAllowed('feat-something.api.genfeed.localhost')).toBe(true);
    });

    it('still rejects unrelated hosts', () => {
      expect(isAllowed('evil.example.com')).toBe(false);
      expect(isAllowed('genfeed.localhost.evil.com')).toBe(false);
    });
  });

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

  it('keeps the legacy /workflows surface hard-cut with no compatibility redirect', async () => {
    const redirects = await config.redirects?.();

    const legacyWorkflowRedirects = (redirects ?? []).filter((redirect) =>
      redirect.source
        .replace(createBrandAppRoute(':orgSlug', ':brandSlug'), '')
        .startsWith('/workflows'),
    );

    expect(legacyWorkflowRedirects).toEqual([]);
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

  it('redirects /studio to the storyboard production surface', async () => {
    const redirects = await config.redirects?.();
    const studioRedirect = redirects?.find(
      (redirect) => redirect.source === APP_ROUTES.STUDIO.ROOT,
    );

    expect(studioRedirect).toEqual({
      destination: APP_ROUTES.STUDIO.STORYBOARD,
      permanent: false,
      source: APP_ROUTES.STUDIO.ROOT,
    });
  });

  it('hard-cuts every retired studio one-off tab to the agent', async () => {
    const redirects = await config.redirects?.();

    for (const segment of ['avatar', 'image', 'images', 'music', 'video']) {
      expect(redirects).toContainEqual({
        destination: APP_ROUTES.AGENT.NEW,
        permanent: true,
        source: `${APP_ROUTES.STUDIO.ROOT}/${segment}`,
      });
      expect(redirects).toContainEqual({
        destination: createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          APP_ROUTES.AGENT.NEW,
        ),
        permanent: true,
        source: createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          `${APP_ROUTES.STUDIO.ROOT}/${segment}`,
        ),
      });
    }
  });

  it('hard-cuts retired studio asset detail routes to the library', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination: APP_ROUTES.LIBRARY.ROOT,
      permanent: true,
      source: `${APP_ROUTES.STUDIO.ROOT}/image/:assetId`,
    });
  });

  it('does not define a broad studio wildcard redirect', async () => {
    const redirects = await config.redirects?.();
    const studioWildcards = redirects?.filter(
      (redirect) =>
        redirect.source.startsWith(APP_ROUTE_PREFIXES.STUDIO) &&
        redirect.source.includes(':path*'),
    );

    expect(studioWildcards).toEqual([]);
  });

  it('sends X-Robots-Tag: noindex, nofollow on every studio route', async () => {
    const headers = await config.headers?.();
    const catchAll = headers?.find((header) => header.source === '/(.*)');

    expect(catchAll?.headers).toContainEqual({
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow',
    });
  });

  it('never advertises the studio as indexable', async () => {
    const headers = await config.headers?.();
    const robotsValues =
      headers
        ?.flatMap((header) => header.headers)
        .filter((header) => header.key === 'X-Robots-Tag')
        .map((header) => header.value) ?? [];

    expect(robotsValues).not.toHaveLength(0);
    for (const value of robotsValues) {
      expect(value).not.toMatch(/(^|[\s,])index/);
    }
  });

  it('aliases published serializers to the local workspace source', () => {
    expect(config.turbopack?.resolveAlias).toMatchObject({
      '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
      '@serializers': '../../packages/serializers/src',
    });
  });

  it('exposes a non-empty build id that generateBuildId agrees with', async () => {
    const buildId = config.env?.NEXT_PUBLIC_BUILD_ID;

    expect(buildId?.trim()).toBeTruthy();
    await expect(config.generateBuildId?.()).resolves.toBe(buildId);
  });

  it('keeps the dev build id stable so the Turbopack dev cache survives restarts', () => {
    // A per-start value (e.g. `dev-${Date.now()}`) lands in the compiler define
    // map and invalidates the whole filesystem cache on every dev-server boot.
    expect(config.env?.NEXT_PUBLIC_BUILD_ID).not.toMatch(/^dev-\d+$/);
  });

  it('does not re-list packages the base config already transpiles', () => {
    const transpiled = config.transpilePackages ?? [];

    expect(new Set(transpiled).size).toBe(transpiled.length);
    expect(transpiled).toEqual(expect.arrayContaining(['@tiptap/core']));
  });
});
