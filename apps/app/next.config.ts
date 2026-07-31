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
  APP_ROUTE_PREFIXES.POSTS,
  APP_ROUTE_PREFIXES.COMPOSE,
  APP_ROUTE_PREFIXES.ANALYTICS,
  APP_ROUTE_PREFIXES.ORCHESTRATION,
  APP_ROUTE_PREFIXES.LIBRARY,
  APP_ROUTE_PREFIXES.EDITOR,
  APP_ROUTE_PREFIXES.RESEARCH,
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
 * Parent app home is `/[app]`, not `/[app]/overview`. Permanent redirects keep
 * bookmarks and shared links working after the home path moved to root.
 */
function appOverviewToHomeRedirects(appRoot: `/${string}`) {
  const overviewPath = `${appRoot}/overview` as const;

  return [
    {
      destination: appRoot,
      permanent: true,
      source: overviewPath,
    },
    {
      destination: createBrandAppRoute(':orgSlug', ':brandSlug', appRoot),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', overviewPath),
    },
    {
      destination: createOrganizationAppRoute(':orgSlug', appRoot),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', overviewPath),
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

const config = createAppNextConfig({
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
    {
      destination: APP_ROUTES.RESEARCH.DISCOVERY,
      permanent: false,
      source: APP_ROUTES.RESEARCH.ROOT,
    },
    {
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
    },
    {
      destination: APP_ROUTES.LIBRARY.ROOT,
      permanent: false,
      source: APP_ROUTES.LIBRARY.INGREDIENTS,
    },
    {
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
    },
    {
      destination: APP_ROUTES.SETTINGS.ROOT,
      permanent: false,
      source: APP_ROUTES.SETTINGS.PERSONAL,
    },
    {
      destination: APP_ROUTES.COMPOSE.ARTICLE,
      permanent: false,
      source: APP_ROUTES.COMPOSE.ROOT,
    },
    {
      destination: APP_ROUTES.STUDIO.IMAGE,
      permanent: false,
      source: APP_ROUTES.STUDIO.ROOT,
    },
    // App homes live at `/[app]`; `/[app]/overview` is a permanent alias.
    ...appOverviewToHomeRedirects(APP_ROUTES.ORCHESTRATION.ROOT),
    ...appOverviewToHomeRedirects(APP_ROUTES.WORKSPACE.ROOT),
    ...appOverviewToHomeRedirects(APP_ROUTES.LIBRARY.ROOT),
    ...appOverviewToHomeRedirects(APP_ROUTES.ANALYTICS.ROOT),
    // Campaigns / outreach moved from Automate → Publish (hard cut).
    ...legacyPathRedirects(
      '/orchestration/campaigns',
      APP_ROUTES.POSTS.CAMPAIGNS,
    ),
    ...legacyPathRedirects(
      '/orchestration/outreach-campaigns',
      APP_ROUTES.POSTS.OUTREACH_CAMPAIGNS,
    ),
    // Former /workflows surface lives under Automate workflows.
    ...legacyPathRedirects('/workflows', APP_ROUTES.ORCHESTRATION.WORKFLOWS),
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

export default config;
