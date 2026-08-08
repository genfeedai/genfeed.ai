import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envFlag, getDeployment } from '@genfeedai/config/deployment';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants/routes.constant';
import { createAppNextConfig } from '@genfeedai/next-config';
import { withSerwist } from '@serwist/turbopack';
import createNextIntlPlugin from 'next-intl/plugin';

// Deterministic, empty-string-safe build id. A plain `??` chain does NOT skip
// empty strings, and Vercel sets VERCEL_GIT_COMMIT_SHA="" on CLI deploys with no
// git metadata. An empty buildId makes Next.js embed "b":"" in RSC flight
// payloads, so the App Router treats every navigation as a cross-deployment
// change and forces a full hard reload (and silently disables version checks).
// firstNonBlank skips blank/whitespace values so generateBuildId never returns "".
//
// The dev fallback is a STABLE constant, not a timestamp. `config.env` is fed
// straight into the compiler define map (next/dist/build/define-env.js →
// getNextConfigEnv), and Turbopack's dev filesystem cache is on by default
// (`turbopackFileSystemCacheForDev: true`, next/dist/server/config-shared.js).
// A per-start timestamp changes the compilation environment on every `next dev`
// boot, so no cached artifact can ever be reused — every restart is a full cold
// compile and each run leaves behind another stale cache generation. A constant
// keeps the define map identical across restarts so the cache warm-starts, and
// keeps the client bundle and /api/version agreeing on one id in dev.
const firstNonBlank = (
  ...values: Array<string | undefined>
): string | undefined => values.find((value) => value?.trim());

const buildId =
  firstNonBlank(
    process.env.BUILD_ID,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_ID,
  ) ?? 'dev';

const appDir = path.dirname(fileURLToPath(import.meta.url));

const NEXT_PUBLIC_GENFEED_CLOUD = envFlag(
  process.env.GENFEED_CLOUD ?? process.env.NEXT_PUBLIC_GENFEED_CLOUD,
)
  ? '1'
  : '';
const IS_CLOUD_APP_SHELL = getDeployment() === 'cloud';
const IS_LOCAL_APP_SHELL = !IS_CLOUD_APP_SHELL;

if (
  process.env.GENFEED_DESKTOP_BUNDLE === '1' &&
  !envFlag(process.env.NEXT_PUBLIC_DESKTOP_SHELL)
) {
  throw new Error(
    'GENFEED_DESKTOP_BUNDLE requires NEXT_PUBLIC_DESKTOP_SHELL=1.',
  );
}

const DEFAULT_ORG = 'default';
const DEFAULT_BRAND = 'default';
const resolvedApiBaseUrl = (
  process.env.API_URL || 'http://localhost:3010'
).replace(/\/v1\/?$/, '');

const selfHostedBrandRoutePrefixes = [
  APP_ROUTE_PREFIXES.WORKSPACE,
  APP_ROUTE_PREFIXES.AGENT,
  APP_ROUTE_PREFIXES.STUDIO,
  APP_ROUTE_PREFIXES.PUBLISH,
  APP_ROUTE_PREFIXES.ANALYTICS,
  APP_ROUTE_PREFIXES.AUTOMATE,
  APP_ROUTE_PREFIXES.LIBRARY,
  APP_ROUTE_PREFIXES.DISCOVER,
] as const;

const selfHostedRewrites = IS_LOCAL_APP_SHELL
  ? selfHostedBrandRoutePrefixes.map((routePrefix) => {
      const segment = routePrefix.slice(1);
      return {
        destination: `/${DEFAULT_ORG}/${DEFAULT_BRAND}/${segment}/:path*`,
        source: `/${segment}/:path*`,
      };
    })
  : [];

const selfHostedOrgRewrites = IS_LOCAL_APP_SHELL
  ? [APP_ROUTE_PREFIXES.SETTINGS.slice(1)].map((segment) => ({
      destination: `/${DEFAULT_ORG}/~/${segment}/:path*`,
      source: `/${segment}/:path*`,
    }))
  : [];

/**
 * Complete-path app home: bare `/[app]` permanently redirects to
 * `/[app]/overview` so Overview is a complete path that does not prefix-match
 * siblings (Workspace, Analytics, Automate, Library). Covers unscoped,
 * brand-scoped, and org-scoped (`~/`) routes.
 */
function appHomeToOverviewRedirects(appRoot: `/${string}`) {
  const overviewPath = `${appRoot}/overview` as const;

  return [
    {
      destination: overviewPath,
      permanent: true,
      source: appRoot,
    },
    {
      destination: createBrandAppRoute(':orgSlug', ':brandSlug', overviewPath),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', appRoot),
    },
    {
      destination: createOrganizationAppRoute(':orgSlug', overviewPath),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', appRoot),
    },
  ];
}

/** Permanent hard-cut of a legacy path (and nested segments) onto a new prefix. */
function legacyPathRedirects(fromPrefix: `/${string}`, toPrefix: `/${string}`) {
  return [
    {
      destination: toPrefix,
      permanent: true,
      source: fromPrefix,
    },
    {
      destination: `${toPrefix}/:path*`,
      permanent: true,
      source: `${fromPrefix}/:path*`,
    },
    {
      destination: createBrandAppRoute(':orgSlug', ':brandSlug', toPrefix),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', fromPrefix),
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        `${toPrefix}/:path*`,
      ),
      permanent: true,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        `${fromPrefix}/:path*`,
      ),
    },
  ];
}

/**
 * Standalone Studio one-off tabs are retired: prompt-bar surfaces hard-cut to
 * the Agent, and their asset detail routes hard-cut to Library. Covers the
 * canonical segments plus the plural aliases the old route accepted.
 */
const RETIRED_STUDIO_TAB_SEGMENTS = [
  'avatar',
  'avatars',
  'image',
  'images',
  'music',
  'video',
  'videos',
] as const;

function retiredStudioTabRedirects() {
  return RETIRED_STUDIO_TAB_SEGMENTS.flatMap((segment) => {
    const tabPath = `${APP_ROUTES.STUDIO.ROOT}/${segment}` as const;
    const detailPath = `${tabPath}/:assetId` as const;

    return [
      {
        destination: APP_ROUTES.LIBRARY.ROOT,
        permanent: true,
        source: detailPath,
      },
      {
        destination: createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          APP_ROUTES.LIBRARY.ROOT,
        ),
        permanent: true,
        source: createBrandAppRoute(':orgSlug', ':brandSlug', detailPath),
      },
      {
        destination: APP_ROUTES.AGENT.NEW,
        permanent: true,
        source: tabPath,
      },
      {
        destination: createBrandAppRoute(
          ':orgSlug',
          ':brandSlug',
          APP_ROUTES.AGENT.NEW,
        ),
        permanent: true,
        source: createBrandAppRoute(':orgSlug', ':brandSlug', tabPath),
      },
    ];
  });
}

const config = createAppNextConfig({
  // Defense in depth alongside app/robots.ts and the root layout metadata: the
  // header also covers responses that carry no HTML head (API routes, redirects,
  // assets), so nothing under app.genfeed.ai is indexable.
  headers: async () => [
    {
      headers: [
        {
          key: 'X-Robots-Tag',
          value: 'noindex, nofollow',
        },
      ],
      source: '/(.*)',
    },
  ],
  output: process.env.GENFEED_DESKTOP_BUNDLE === '1' ? 'standalone' : undefined,
  rewrites: async () => [
    {
      destination: `${resolvedApiBaseUrl}/v1/:path*`,
      source: '/v1/:path*',
    },
    ...selfHostedRewrites,
    ...selfHostedOrgRewrites,
  ],
  redirects: async () => [
    // Platform admin home is the overview dashboard (complete path). Bare
    // `/admin` and incomplete `/admin/overview` permanently redirect here.
    {
      destination: APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
      permanent: true,
      source: APP_ROUTES.ADMIN.ROOT,
    },
    {
      destination: APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
      permanent: true,
      source: `${APP_ROUTES.ADMIN.ROOT}/overview`,
    },

    {
      destination: APP_ROUTES.WORKSPACE.INBOX_UNREAD,
      permanent: false,
      source: APP_ROUTES.WORKSPACE.INBOX,
    },
    {
      // Cloud org/brand-scoped inbox index has no page (only [view]); redirect
      // to the unread view so `/:org/:brand/workspace/inbox` doesn't 404.
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
    },
    // Agent CTAs historically emitted bare `/review` (and route-rewrite scoped
    // it to `/:org/:brand/review`) — that page never existed. Send both dead
    // shapes to Publish Review so stored thread links stop 404ing.
    {
      destination: APP_ROUTES.PUBLISH.REVIEW,
      permanent: true,
      source: '/review',
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.PUBLISH.REVIEW,
      ),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', '/review'),
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.PUBLISH.REVIEW,
      ),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', '/review'),
    },
    {
      destination: APP_ROUTES.DISCOVER.OVERVIEW,
      permanent: false,
      source: APP_ROUTES.DISCOVER.ROOT,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVER.OVERVIEW,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVER.ROOT,
      ),
    },
    {
      destination: APP_ROUTES.DISCOVER.OVERVIEW,
      permanent: true,
      source: APP_ROUTES.DISCOVER.DISCOVERY,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVER.OVERVIEW,
      ),
      permanent: true,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVER.DISCOVERY,
      ),
    },
    // Retired Socials peer — same TrendsList surface as Overview.
    {
      destination: APP_ROUTES.DISCOVER.OVERVIEW,
      permanent: true,
      source: APP_ROUTES.DISCOVER.SOCIALS,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVER.OVERVIEW,
      ),
      permanent: true,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.DISCOVER.SOCIALS,
      ),
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.DISCOVER.OVERVIEW,
      ),
      permanent: true,
      source: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.DISCOVER.SOCIALS,
      ),
    },
    {
      destination: APP_ROUTES.LIBRARY.OVERVIEW,
      permanent: false,
      source: APP_ROUTES.LIBRARY.INGREDIENTS,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.OVERVIEW,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.INGREDIENTS,
      ),
    },
    {
      destination: APP_ROUTES.SETTINGS.ROOT,
      permanent: false,
      source: APP_ROUTES.SETTINGS.PERSONAL,
    },
    {
      destination: APP_ROUTES.STUDIO.STORYBOARD,
      permanent: false,
      source: APP_ROUTES.STUDIO.ROOT,
    },
    {
      // Studio has no root page — Storyboard is the production landing surface.
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.STUDIO.STORYBOARD,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.STUDIO.ROOT,
      ),
    },
    ...retiredStudioTabRedirects(),
    // Complete-path homes: bare `/[app]` → `/[app]/overview` (Workspace,
    // Analytics, Automate, Library, Publish). Discover/Studio already redirect
    // ROOT to a named child (discovery / storyboard).
    ...appHomeToOverviewRedirects(APP_ROUTES.WORKSPACE.ROOT),
    ...appHomeToOverviewRedirects(APP_ROUTES.AUTOMATE.ROOT),
    ...appHomeToOverviewRedirects(APP_ROUTES.LIBRARY.ROOT),
    ...appHomeToOverviewRedirects(APP_ROUTES.ANALYTICS.ROOT),
    ...appHomeToOverviewRedirects(APP_ROUTES.PUBLISH.ROOT),
    // Campaigns / outreach live under Automate (hard cut back from Publish).
    ...legacyPathRedirects('/publish/campaigns', APP_ROUTES.AUTOMATE.CAMPAIGNS),
    ...legacyPathRedirects(
      '/publish/outreach-campaigns',
      APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS,
    ),
  ],
  sentryProject: 'app-genfeed-ai',
});

config.env = {
  ...(config.env ?? {}),
  NEXT_PUBLIC_BUILD_ID: buildId,
  NEXT_PUBLIC_GENFEED_CLOUD,
};

config.generateBuildId = async () => {
  if (!buildId.trim()) {
    throw new Error(
      'generateBuildId: computed buildId is empty; refusing to build.',
    );
  }
  return buildId;
};

config.experimental = {
  ...(config.experimental ?? {}),
  optimizePackageImports: [
    ...(config.experimental?.optimizePackageImports ?? []),
    '@tiptap/core',
    '@tiptap/extension-image',
    '@tiptap/extension-link',
    '@tiptap/extension-mention',
    '@tiptap/extension-placeholder',
    '@tiptap/extensions',
    '@tiptap/pm',
    '@tiptap/react',
    '@tiptap/starter-kit',
    '@tiptap/suggestion',
  ],
};

config.sassOptions = {
  loadPaths: [
    path.resolve(appDir, '../../node_modules'),
    path.resolve(appDir, '../../packages/agent/node_modules'),
  ],
};

config.turbopack = {
  ...(config.turbopack ?? {}),
  resolveAlias: {
    ...(config.turbopack?.resolveAlias ?? {}),
    '@components/buttons/refresh/button-refresh/ButtonRefresh':
      '../../packages/ui/src/components/buttons/refresh/button-refresh/ButtonRefresh.tsx',
    '@components/cards/KpiCard':
      './packages/components/admin/cards/KpiCard.tsx',
    '@components/lazy/LazyModal':
      './packages/components/admin/lazy/LazyModal.ts',
    '@components/lazy/modal/LazyModal':
      '../../packages/ui/src/components/lazy/modal/LazyModal.tsx',
    '@components/loading/fallback/LazyLoadingFallback':
      '../../packages/ui/src/components/loading/fallback/LazyLoadingFallback.tsx',
    '@components/loading/skeleton/SkeletonFallbacks':
      '../../packages/ui/src/components/loading/skeleton/SkeletonFallbacks.tsx',
    '@components/modals/actions/ModalActions':
      '../../packages/ui/src/components/modals/actions/ModalActions.tsx',
    '@components/modals/modal/Modal':
      '../../packages/ui/src/components/modals/modal/Modal.tsx',
    '@components/modals/ModalRole':
      './packages/components/admin/modals/ModalRole.tsx',
    '@components/modals/ModalSubscription':
      './packages/components/admin/modals/ModalSubscription.tsx',
    '@components/social/SocialLinks':
      './packages/components/admin/social/SocialLinks.tsx',
    '@genfeedai/agent': '../../packages/agent/src/index.ts',
    '@genfeedai/client': '../../packages/client/src/index.ts',
    '@genfeedai/constants': '../../packages/constants/src/index.ts',
    '@genfeedai/enums': '../../packages/enums/src/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
    '@genfeedai/interfaces': '../../packages/interfaces/src/index.ts',
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/types': '../../packages/types/src/index.ts',
    '@genfeedai/ui': '../../packages/ui/src/index.ts',
    '@genfeedai/workflows/nodes': '../../packages/workflows/src/nodes/index.ts',
    '@genfeedai/workflows/ui': '../../packages/workflows/src/ui/index.ts',
    '@genfeedai/workflows/ui/canvas':
      '../../packages/workflows/src/ui/canvas/index.ts',
    '@genfeedai/workflows/ui/hooks':
      '../../packages/workflows/src/ui/hooks/index.ts',
    '@genfeedai/workflows/ui/lib':
      '../../packages/workflows/src/ui/lib/index.ts',
    '@genfeedai/workflows/ui/nodes':
      '../../packages/workflows/src/ui/nodes/index.ts',
    '@genfeedai/workflows/ui/panels':
      '../../packages/workflows/src/ui/panels/index.ts',
    '@genfeedai/workflows/ui/provider':
      '../../packages/workflows/src/ui/provider/index.ts',
    '@genfeedai/workflows/ui/stores':
      '../../packages/workflows/src/ui/stores/index.ts',
    '@genfeedai/workflows/ui/styles':
      '../../packages/workflows/src/ui/styles/workflow-ui.css',
    '@genfeedai/workflows/ui/toolbar':
      '../../packages/workflows/src/ui/toolbar/index.ts',
    '@genfeedai/workflows/ui/ui': '../../packages/workflows/src/ui/ui/index.ts',
    '@protected': './app/(protected)/admin',
    '@serializers': '../../packages/serializers/src',
    '@ui/forms/base/form-control/FormControl':
      '../../packages/ui/src/primitives/field.tsx',
  },
  root: path.resolve(appDir, '../..'),
};

// Additive: the tiptap packages and most @genfeedai/* workspaces are already
// transpiled by next.config.base.ts — only list what the base does not cover.
config.transpilePackages = [
  ...(config.transpilePackages ?? []),
  'fullcalendar',
  '@genfeedai/desktop-contracts',
  '@genfeedai/hooks',
  '@genfeedai/serializers',
  '@genfeedai/types',
];

// E2E code-coverage runs against a production build need browser source maps so
// monocart can map executed bytes back to TypeScript. Gated on E2E_COVERAGE so
// normal builds are unaffected. (Dev mode already emits source maps.)
if (process.env.E2E_COVERAGE === '1') {
  config.productionBrowserSourceMaps = true;
}

// Resolves ./i18n/request.ts, next-intl's default request-config location. The
// plugin only registers that alias — there is no `[locale]` segment and no
// next-intl middleware, because locale rides on a cookie (epic #2497).
const withNextIntl = createNextIntlPlugin();

// Bundler-agnostic: withSerwist only appends esbuild to serverExternalPackages
// so app/serwist/[path]/route.ts can require it at runtime to compile the
// service worker. It adds no webpack plugin, so `--turbopack` stays intact.
export default withSerwist(withNextIntl(config));
