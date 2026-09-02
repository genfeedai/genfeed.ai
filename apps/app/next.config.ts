import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envFlag, getDeployment } from '@genfeedai/config/deployment';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  LEGACY_APP_ROUTES,
  PERSONAL_SETTINGS_CHILD_SEGMENTS,
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
const IS_DESKTOP_BUNDLE = process.env.GENFEED_DESKTOP_BUNDLE === '1';

if (IS_DESKTOP_BUNDLE && !envFlag(process.env.NEXT_PUBLIC_DESKTOP_SHELL)) {
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
  APP_ROUTE_PREFIXES.PUBLISHING,
  APP_ROUTE_PREFIXES.ANALYTICS,
  APP_ROUTE_PREFIXES.AUTOMATION,
  APP_ROUTE_PREFIXES.LIBRARY,
  APP_ROUTE_PREFIXES.DISCOVERY,
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
 * Complete-path app home: bare `/[app]` permanently redirects to a named child
 * so the home is a complete path that does not prefix-match its siblings.
 * Defaults to `/[app]/overview` (Workspace, Analytics, Automation, Publishing);
 * Library passes All assets, because its home is the asset browser itself
 * rather than a tile grid. Covers unscoped, brand-scoped, and org-scoped (`~/`)
 * routes.
 */
function appHomeRedirects(
  appRoot: `/${string}`,
  homePath: `/${string}` = `${appRoot}/overview`,
) {
  return [
    {
      destination: homePath,
      permanent: true,
      source: appRoot,
    },
    {
      destination: createBrandAppRoute(':orgSlug', ':brandSlug', homePath),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', appRoot),
    },
    {
      destination: createOrganizationAppRoute(':orgSlug', homePath),
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
 * Newsletter writing is Agent-first. Keep the old Publishing list/generator URL
 * as a permanent compatibility edge; its legacy `?id=` shape resolves directly
 * to the focused newsletter editor instead of losing the selected artifact.
 */
function legacyNewsletterRedirects() {
  const legacyPath = LEGACY_APP_ROUTES.PUBLISHING_NEWSLETTERS;

  return [
    {
      destination: `${APP_ROUTES.EDIT.NEWSLETTER}/:newsletterId`,
      has: [
        {
          key: 'id',
          type: 'query' as const,
          value: '(?<newsletterId>.+)',
        },
      ],
      permanent: true,
      source: legacyPath,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        `${APP_ROUTES.EDIT.NEWSLETTER}/:newsletterId`,
      ),
      has: [
        {
          key: 'id',
          type: 'query' as const,
          value: '(?<newsletterId>.+)',
        },
      ],
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', legacyPath),
    },
    {
      destination: APP_ROUTES.AGENT.NEW,
      permanent: true,
      source: legacyPath,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.AGENT.NEW,
      ),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', legacyPath),
    },
  ];
}

const config = createAppNextConfig({
  // Defense in depth alongside app/robots.txt/route.ts and root metadata: the
  // header also covers responses that carry no HTML head (API routes, redirects,
  // assets), so nothing under app.genfeed.ai is indexable.
  headers: async () => [
    {
      headers: [
        {
          key: 'Content-Signal',
          value: 'ai-train=no, search=no, ai-input=no',
        },
        {
          key: 'Link',
          value: [
            '<https://genfeed.ai/.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"',
            '<https://genfeed.ai/.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
          ].join(', '),
        },
        {
          key: 'X-Robots-Tag',
          value: 'noindex, nofollow',
        },
      ],
      source: '/(.*)',
    },
  ],
  output: IS_DESKTOP_BUNDLE ? 'standalone' : undefined,
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
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.WORKSPACE.INBOX_UNREAD,
      ),
      permanent: false,
      source: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.WORKSPACE.INBOX,
      ),
    },
    // Leftover `/overview` app. Workspace Overview is the canonical home.
    {
      destination: APP_ROUTES.WORKSPACE.OVERVIEW,
      permanent: true,
      source: APP_ROUTES.OVERVIEW.ROOT,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.WORKSPACE.OVERVIEW,
      ),
      permanent: true,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.OVERVIEW.ROOT,
      ),
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.WORKSPACE.OVERVIEW,
      ),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', APP_ROUTES.OVERVIEW.ROOT),
    },
    // Agent CTAs historically emitted bare `/review` (and route-rewrite scoped
    // it to `/:org/:brand/review`) — that page never existed. Send both dead
    // shapes to Publishing Review so stored thread links stop 404ing.
    {
      destination: APP_ROUTES.PUBLISHING.REVIEW,
      permanent: true,
      source: '/review',
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.PUBLISHING.REVIEW,
      ),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', '/review'),
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.PUBLISHING.REVIEW,
      ),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', '/review'),
    },
    // Org Settings → Agents. /settings/policy was the old slug.
    {
      destination: APP_ROUTES.SETTINGS.AGENTS,
      permanent: true,
      source: '/settings/policy',
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.SETTINGS.AGENTS,
      ),
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', '/settings/policy'),
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.SETTINGS.AGENTS,
      ),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', '/settings/policy'),
    },
    // Brand-scoped /admin/* never existed. Send it to the platform dashboard.
    {
      destination: APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', '/admin'),
    },
    {
      destination: APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
      permanent: true,
      source: createBrandAppRoute(':orgSlug', ':brandSlug', '/admin/:path*'),
    },
    {
      destination: APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', '/admin'),
    },
    {
      destination: APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD,
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', '/admin/:path*'),
    },
    {
      destination: APP_ROUTES.DISCOVERY.OVERVIEW,
      permanent: false,
      source: APP_ROUTES.DISCOVERY.ROOT,
    },
    {
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
    },
    {
      destination: APP_ROUTES.LIBRARY.ASSETS,
      permanent: false,
      source: APP_ROUTES.LIBRARY.INGREDIENTS,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.ASSETS,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.INGREDIENTS,
      ),
    },
    // The tile-grid Overview held no assets; All assets is the Library home.
    {
      destination: APP_ROUTES.LIBRARY.ASSETS,
      permanent: false,
      source: APP_ROUTES.LIBRARY.OVERVIEW,
    },
    {
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.ASSETS,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.LIBRARY.OVERVIEW,
      ),
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.LIBRARY.ASSETS,
      ),
      permanent: false,
      source: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.LIBRARY.OVERVIEW,
      ),
    },
    {
      destination: APP_ROUTES.SETTINGS.PERSONAL,
      permanent: true,
      source: APP_ROUTES.SETTINGS.ROOT,
    },
    {
      destination: createOrganizationAppRoute(
        ':orgSlug',
        APP_ROUTES.SETTINGS.GENERAL,
      ),
      permanent: true,
      source: createOrganizationAppRoute(':orgSlug', APP_ROUTES.SETTINGS.ROOT),
    },
    ...PERSONAL_SETTINGS_CHILD_SEGMENTS.map((segment) => ({
      destination: `${APP_ROUTES.SETTINGS.ROOT}/${segment}`,
      permanent: false,
      source: createOrganizationAppRoute(
        ':orgSlug',
        `${APP_ROUTES.SETTINGS.ROOT}/${segment}`,
      ),
    })),
    {
      destination: APP_ROUTES.STUDIO.GENERATE,
      permanent: false,
      source: APP_ROUTES.STUDIO.ROOT,
    },
    {
      // Studio has no root page — Storyboard is the production landing surface.
      destination: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.STUDIO.GENERATE,
      ),
      permanent: false,
      source: createBrandAppRoute(
        ':orgSlug',
        ':brandSlug',
        APP_ROUTES.STUDIO.ROOT,
      ),
    },
    ...legacyNewsletterRedirects(),
    // Complete-path homes: bare `/[app]` → a named child. Discovery/Studio
    // already redirect ROOT to one (discovery / storyboard); Library's home is
    // the asset browser, not an overview tile grid.
    ...appHomeRedirects(APP_ROUTES.WORKSPACE.ROOT),
    ...appHomeRedirects(APP_ROUTES.AUTOMATION.ROOT),
    ...appHomeRedirects(APP_ROUTES.LIBRARY.ROOT, APP_ROUTES.LIBRARY.ASSETS),
    ...appHomeRedirects(APP_ROUTES.ANALYTICS.ROOT),
    ...appHomeRedirects(APP_ROUTES.PUBLISHING.ROOT),
    // Agent Programs stay under Automation. Outreach / reply drip moved to Messages.
    ...legacyPathRedirects(
      '/publishing/campaigns',
      APP_ROUTES.AUTOMATION.CAMPAIGNS,
    ),
    ...legacyPathRedirects(
      '/publishing/outreach-campaigns',
      APP_ROUTES.MESSAGES.OUTREACH,
    ),
    ...legacyPathRedirects(
      '/automation/outreach-campaigns',
      APP_ROUTES.MESSAGES.OUTREACH,
    ),
    ...legacyPathRedirects(
      '/automation/reply-campaigns',
      APP_ROUTES.MESSAGES.REPLY_DRIP,
    ),
    ...legacyPathRedirects('/automation/replies', APP_ROUTES.MESSAGES.REPLIES),
    ...legacyPathRedirects(
      LEGACY_APP_ROUTES.LAB_CRON_JOBS,
      APP_ROUTES.AUTOMATION.WORKFLOWS,
    ),
    // `/[org]/[brand]/workflows` is not a standalone app — land on Automation.
    ...legacyPathRedirects(
      LEGACY_APP_ROUTES.WORKFLOWS,
      APP_ROUTES.AUTOMATION.WORKFLOWS,
    ),
  ],
  sentryProject: 'app-genfeed-ai',
});

// Electron serves local assets directly and does not need Next's native image
// optimizer. Omitting sharp/libvips from this one standalone trace saves tens
// of megabytes without changing cloud or self-hosted image behavior.
if (IS_DESKTOP_BUNDLE) {
  config.images = {
    ...config.images,
    unoptimized: true,
  };
}

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
    '@genfeedai/actions': '../../packages/actions/src/index.ts',
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
  '@genfeedai/actions',
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
