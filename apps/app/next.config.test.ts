import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { isCsrfOriginAllowed } from 'next/dist/server/app-render/csrf-protection.js';
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern.js';
import { describe, expect, it } from 'vitest';
import rootPackage from '../../package.json' with { type: 'json' };
import config from './next.config';
import appPackage from './package.json' with { type: 'json' };

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');

describe('app next.config', () => {
  it('advertises the public agent catalog without indexing the app', async () => {
    const headers = await config.headers?.();
    const rootHeaders = headers?.find((entry) => entry.source === '/(.*)');

    expect(rootHeaders?.headers).toEqual(
      expect.arrayContaining([
        {
          key: 'X-Robots-Tag',
          value: 'noindex, nofollow',
        },
        expect.objectContaining({
          key: 'Link',
          value: expect.stringContaining(
            '<https://genfeed.ai/.well-known/api-catalog>; rel="service-desc"',
          ),
        }),
      ]),
    );
  });

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

  it('allows Portless local file hosts for next/image', () => {
    // LibrarySourcePreview feeds ingredient URLs from the files service into
    // next/image. Next's default loader throws unconfigured-host unless the
    // hostname matches images.remotePatterns via this exact matcher.
    const remotePatterns = config.images?.remotePatterns ?? [];
    const domains = config.images?.domains ?? [];
    const isAllowed = (href: string) =>
      hasRemoteMatch(domains, remotePatterns, new URL(href));

    expect(
      isAllowed(
        `https://files.genfeed.localhost/local/ingredients/images/${testId('ingredient')}`,
      ),
    ).toBe(true);
    expect(
      isAllowed(
        'https://qa-local-2026-08-13.files.genfeed.localhost/local/ingredients/images/x',
      ),
    ).toBe(true);
    expect(
      isAllowed('https://files.genfeed.ai/local/ingredients/images/x'),
    ).toBe(true);
    expect(
      isAllowed('https://evil.example.com/local/ingredients/images/x'),
    ).toBe(false);
    expect(isAllowed('https://files.genfeed.localhost.evil.com/local/x')).toBe(
      false,
    );
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

  it('does not define a stale bare-root redirect', async () => {
    const redirects = await config.redirects?.();
    expect(redirects?.some((redirect) => redirect.source === '/')).toBe(false);
  });

  it('redirects dead bare /review CTAs to publish/review', async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      destination: '/publishing/review',
      permanent: true,
      source: '/review',
    });
    expect(redirects).toContainEqual({
      destination: '/:orgSlug/:brandSlug/publishing/review',
      permanent: true,
      source: '/:orgSlug/:brandSlug/review',
    });
  });

  it('never redirects /library/assets away — it is the Library home', async () => {
    const redirects = await config.redirects?.();

    expect(
      redirects?.filter((redirect) =>
        String(redirect.source).endsWith(APP_ROUTES.LIBRARY.ASSETS),
      ),
    ).toEqual([]);
  });

  it('redirects brand-scoped and org-scoped /admin to the platform dashboard', async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      destination: '/admin/overview/dashboard',
      permanent: true,
      source: '/:orgSlug/:brandSlug/admin',
    });
    expect(redirects).toContainEqual({
      destination: '/admin/overview/dashboard',
      permanent: true,
      source: '/:orgSlug/:brandSlug/admin/:path*',
    });
    expect(redirects).toContainEqual({
      destination: '/admin/overview/dashboard',
      permanent: true,
      source: '/:orgSlug/~/admin',
    });
    expect(redirects).toContainEqual({
      destination: '/admin/overview/dashboard',
      permanent: true,
      source: '/:orgSlug/~/admin/:path*',
    });
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

  it.each([
    APP_ROUTES.WORKSPACE.ROOT,
    APP_ROUTES.AUTOMATION.ROOT,
    APP_ROUTES.ANALYTICS.ROOT,
    APP_ROUTES.PUBLISHING.ROOT,
  ] as const)(
    'permanently redirects bare %s to complete-path overview home',
    async (appRoot) => {
      const redirects = await config.redirects?.();
      const overviewPath = `${appRoot}/overview`;

      expect(redirects).toContainEqual({
        destination: overviewPath,
        permanent: true,
        source: appRoot,
      });
      expect(redirects).toContainEqual({
        destination: createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          overviewPath,
        ),
        permanent: true,
        source: createBrandAppRoute(':orgSlug', ':brandSlug', appRoot),
      });
      // Must not collapse overview back onto bare root.
      expect(
        redirects?.some(
          (redirect) =>
            redirect.source === overviewPath &&
            redirect.destination === appRoot,
        ),
      ).toBe(false);
    },
  );

  it('permanently redirects bare /library to All assets, not an overview', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toContainEqual({
      destination: APP_ROUTES.LIBRARY.ASSETS,
      permanent: true,
      source: APP_ROUTES.LIBRARY.ROOT,
    });
    expect(redirects).toContainEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.ASSETS,
      ),
      permanent: true,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.ROOT,
      ),
    });
  });

  it('does not redirect Publish Campaigns into Automation Programs', async () => {
    const redirects = await config.redirects?.();
    const sources = (redirects ?? []).map((redirect) => redirect.source);

    expect(sources).not.toContain('/publishing/campaigns');
    expect(sources).not.toContain('/publishing/campaigns/:path*');
    expect(sources).not.toContain(
      createBrandAppRoute(':orgSlug', ':brandSlug', '/publishing/campaigns'),
    );
  });

  it.each([
    '/overview',
    '/settings/policy',
    '/library/ingredients',
    '/library/overview',
    '/publishing/outreach-campaigns',
    '/automation/outreach-campaigns',
    '/automation/reply-campaigns',
    '/automation/replies',
    '/publishing/newsletters',
    '/workflows',
    '/tasks',
    '/automation/analytics',
    '/automation/configuration',
    '/automation/hire',
    '/automation/library',
    '/automation/agents/new',
    '/automation/orchestrator',
    '/automation/skills',
    '/settings/links',
    '/settings/organization/credentials',
  ])('removes deprecated redirects for %s in every scope', async (route) => {
    const redirects = await config.redirects?.();
    const sources = (redirects ?? []).map((redirect) => redirect.source);
    for (const prefix of ['', '/:orgSlug/:brandSlug', '/:orgSlug/~']) {
      expect(sources).not.toContain(`${prefix}${route}`);
      expect(sources).not.toContain(`${prefix}${route}/:path*`);
    }
  });

  it('does not redirect retired Lab routes', async () => {
    const redirects = await config.redirects?.();

    expect(redirects).toBeDefined();
    expect(
      redirects?.filter(
        (redirect) =>
          /(?:^|\/)lab(?:\/|$)/.test(redirect.source) ||
          /(?:^|\/)lab(?:\/|$)/.test(redirect.destination),
      ),
    ).toEqual([]);
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

  it('redirects org-scoped /discovery to /discovery/overview', async () => {
    const redirects = await config.redirects?.();
    const discoverRedirect = redirects?.find(
      (redirect) =>
        redirect.source ===
        createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          APP_ROUTES.DISCOVERY.ROOT,
        ),
    );

    expect(discoverRedirect).toEqual({
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVERY.OVERVIEW,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVERY.ROOT,
      ),
    });
  });

  it('redirects /studio to the generate playground', async () => {
    const redirects = await config.redirects?.();
    const studioRedirect = redirects?.find(
      (redirect) => redirect.source === APP_ROUTES.STUDIO.ROOT,
    );

    expect(studioRedirect).toEqual({
      destination: APP_ROUTES.STUDIO.GENERATE,
      permanent: false,
      source: APP_ROUTES.STUDIO.ROOT,
    });
  });

  it('keeps no legacy redirect surface for the retired studio tabs', async () => {
    // The one-off tabs came back as `/studio/generate`, so the 28 legacy
    // `/studio/<type>` rules were hard-cut rather than repointed — there is no
    // redirect table to maintain for them.
    const redirects = (await config.redirects?.()) ?? [];
    const legacyStudioSources = redirects.filter((redirect) =>
      /^(\/:orgSlug\/(:brandSlug|~))?\/studio\/(audio|avatar|image|images|music|video|videos)(\/|$)/.test(
        redirect.source,
      ),
    );

    expect(legacyStudioSources).toEqual([]);
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

  it('aliases workflow UI and nodes to package source', () => {
    expect(config.turbopack?.resolveAlias).toMatchObject({
      '@genfeedai/workflows/nodes':
        '../../packages/workflows/src/nodes/index.ts',
      '@genfeedai/workflows/ui': '../../packages/workflows/src/ui/index.ts',
    });
  });

  it('opts out of Next rewriting CLAUDE.md and AGENTS.md', () => {
    // next 16.3+ upserts a managed agent-rules block into the Next project
    // root on `next dev`. That is apps/app here, not the monorepo root.
    expect(config.agentRules).toBe(false);
  });

  it('hoists next-intl to the turbopack root without remapping package exports', () => {
    // bun isolates next-intl under apps/app unless the root workspace lists it.
    // turbopack.root is the repo root, so workspace packages (agent/pages)
    // fail with "Can't resolve 'next-intl'" when it is missing there.
    // A resolveAlias to a filesystem path also fails: it bypasses next-intl's
    // react-server / react-client exports.
    expect(config.turbopack?.root).toBe(repoRoot);
    expect(rootPackage.dependencies['next-intl']).toBe(
      appPackage.dependencies['next-intl'],
    );
    expect(
      existsSync(path.join(repoRoot, 'node_modules/next-intl/package.json')),
    ).toBe(true);
    expect(config.turbopack?.resolveAlias?.['next-intl']).toBeUndefined();
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
