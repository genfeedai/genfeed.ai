import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppNextConfig } from '@genfeedai/next-config';
import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

// Deterministic, empty-string-safe build id. A plain `??` chain does NOT skip
// empty strings, and Vercel sets VERCEL_GIT_COMMIT_SHA="" on CLI deploys with no
// git metadata. An empty buildId makes Next.js embed "b":"" in RSC flight
// payloads, so the App Router treats every navigation as a cross-deployment
// change and forces a full hard reload (and silently disables version checks).
// firstNonBlank skips blank/whitespace values; the dev-* fallback guarantees the
// id is never empty so generateBuildId never returns "".
const firstNonBlank = (
  ...values: Array<string | undefined>
): string | undefined => values.find((value) => value?.trim());

const buildId =
  firstNonBlank(
    process.env.BUILD_ID,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_ID,
  ) ?? `dev-${Date.now()}`;

const withBundleAnalyzer = bundleAnalyzer({
  analyzerMode: process.env.BUNDLE_ANALYZE === 'json' ? 'json' : 'static',
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workflowUiRoot = path.resolve(appDir, '../../packages/workflow-ui');
const helpersRoot = path.resolve(appDir, '../../packages/helpers');
const serializersRoot = path.resolve(appDir, '../../packages/serializers');

const workflowUiAliases = {
  '@genfeedai/helpers': path.join(helpersRoot, 'src/index.ts'),
  '@genfeedai/workflow-ui': path.join(workflowUiRoot, 'src/index.ts'),
  '@genfeedai/workflow-ui/canvas': path.join(
    workflowUiRoot,
    'src/canvas/index.ts',
  ),
  '@genfeedai/workflow-ui/hooks': path.join(
    workflowUiRoot,
    'src/hooks/index.ts',
  ),
  '@genfeedai/workflow-ui/lib': path.join(workflowUiRoot, 'src/lib/index.ts'),
  '@genfeedai/workflow-ui/nodes': path.join(
    workflowUiRoot,
    'src/nodes/index.ts',
  ),
  '@genfeedai/workflow-ui/panels': path.join(
    workflowUiRoot,
    'src/panels/index.ts',
  ),
  '@genfeedai/workflow-ui/provider': path.join(
    workflowUiRoot,
    'src/provider/index.ts',
  ),
  '@genfeedai/workflow-ui/stores': path.join(
    workflowUiRoot,
    'src/stores/index.ts',
  ),
  '@genfeedai/workflow-ui/styles': path.join(
    workflowUiRoot,
    'src/styles/workflow-ui.css',
  ),
  '@genfeedai/workflow-ui/toolbar': path.join(
    workflowUiRoot,
    'src/toolbar/index.ts',
  ),
  '@genfeedai/workflow-ui/ui': path.join(workflowUiRoot, 'src/ui/index.ts'),
};

const NEXT_PUBLIC_GENFEED_CLOUD =
  process.env.NEXT_PUBLIC_GENFEED_CLOUD?.trim() ||
  process.env.GENFEED_CLOUD?.trim() ||
  '';
const IS_CLOUD_APP_SHELL = ['1', 'true'].includes(
  NEXT_PUBLIC_GENFEED_CLOUD.toLowerCase(),
);
const IS_LOCAL_APP_SHELL = !IS_CLOUD_APP_SHELL;
const DEFAULT_ORG = 'default';
const DEFAULT_BRAND = 'default';
const resolvedApiBaseUrl = (
  process.env.API_URL || 'http://localhost:3010'
).replace(/\/v1\/?$/, '');

const selfHostedRewrites = IS_LOCAL_APP_SHELL
  ? [
      'workspace',
      'studio',
      'posts',
      'compose',
      'analytics',
      'workflows',
      'library',
      'editor',
      'research',
      'orchestration',
    ].map((segment) => ({
      destination: `/${DEFAULT_ORG}/${DEFAULT_BRAND}/${segment}/:path*`,
      source: `/${segment}/:path*`,
    }))
  : [];

const selfHostedOrgRewrites = IS_LOCAL_APP_SHELL
  ? ['agent', 'settings'].map((segment) => ({
      destination: `/${DEFAULT_ORG}/~/${segment}/:path*`,
      source: `/${segment}/:path*`,
    }))
  : [];

const config = createAppNextConfig({
  appName: 'app',
  output: process.env.GENFEED_DESKTOP_BUNDLE === '1' ? 'standalone' : undefined,
  pwa: { enabled: true },
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
      destination: '/workspace/inbox/unread',
      permanent: false,
      source: '/workspace/inbox',
    },
    {
      // Cloud org/brand-scoped inbox index has no page (only [view]); redirect
      // to the unread view so `/:org/:brand/workspace/inbox` doesn't 404.
      destination: '/:orgSlug/:brandSlug/workspace/inbox/unread',
      permanent: false,
      source: '/:orgSlug/:brandSlug/workspace/inbox',
    },
    {
      destination: '/research/discovery',
      permanent: false,
      source: '/research',
    },
    {
      destination: '/:orgSlug/:brandSlug/research/discovery',
      permanent: false,
      source: '/:orgSlug/:brandSlug/research',
    },
    {
      destination: '/library/ingredients',
      permanent: false,
      source: '/library',
    },
    {
      destination: '/settings',
      permanent: false,
      source: '/settings/personal',
    },
    {
      destination: '/analytics/overview',
      permanent: false,
      source: '/analytics',
    },
    {
      destination: '/compose/article',
      permanent: false,
      source: '/compose',
    },
    {
      destination: '/:orgSlug/~/agent/:path*',
      permanent: false,
      source: '/:orgSlug/:brandSlug([^~/][^/]*)/agent/:path*',
    },
    {
      destination: '/studio/image',
      permanent: false,
      source: '/studio',
    },
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

config.logging = {
  fetches: {
    fullUrl: false,
  },
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
    '@genfeedai/workflow-saas': '../../packages/workflow-saas/src/index.ts',
    '@genfeedai/workflow-ui': '../../packages/workflow-ui/src/index.ts',
    '@genfeedai/workflow-ui/canvas':
      '../../packages/workflow-ui/src/canvas/index.ts',
    '@genfeedai/workflow-ui/hooks':
      '../../packages/workflow-ui/src/hooks/index.ts',
    '@genfeedai/workflow-ui/lib': '../../packages/workflow-ui/src/lib/index.ts',
    '@genfeedai/workflow-ui/nodes':
      '../../packages/workflow-ui/src/nodes/index.ts',
    '@genfeedai/workflow-ui/panels':
      '../../packages/workflow-ui/src/panels/index.ts',
    '@genfeedai/workflow-ui/provider':
      '../../packages/workflow-ui/src/provider/index.ts',
    '@genfeedai/workflow-ui/stores':
      '../../packages/workflow-ui/src/stores/index.ts',
    '@genfeedai/workflow-ui/styles':
      '../../packages/workflow-ui/src/styles/workflow-ui.css',
    '@genfeedai/workflow-ui/toolbar':
      '../../packages/workflow-ui/src/toolbar/index.ts',
    '@genfeedai/workflow-ui/ui': '../../packages/workflow-ui/src/ui/index.ts',
    '@protected': './app/(protected)/admin',
    '@serializers': '../../packages/serializers/src',
    '@ui/forms/base/form-control/FormControl':
      '../../packages/ui/src/primitives/field.tsx',
  },
  root: path.resolve(appDir, '../..'),
};

config.transpilePackages = [
  '@fullcalendar/core',
  '@fullcalendar/interaction',
  '@fullcalendar/timegrid',
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
  '@genfeedai/agent',
  '@genfeedai/client',
  '@genfeedai/desktop-contracts',
  '@genfeedai/serializers',
  '@genfeedai/constants',
  '@genfeedai/enums',
  '@genfeedai/helpers',
  '@genfeedai/hooks',
  '@genfeedai/interfaces',
  '@genfeedai/types',
  '@genfeedai/workflow-saas',
];

const existingWebpack = config.webpack;

config.webpack = ((webpackConfig, options) => {
  const nextConfig =
    typeof existingWebpack === 'function'
      ? existingWebpack(webpackConfig, options)
      : webpackConfig;

  const packagesRoot = path.resolve(appDir, '../../packages');

  nextConfig.resolve.alias = {
    ...nextConfig.resolve.alias,
    '@genfeedai/serializers': path.join(serializersRoot, 'src/index.ts'),
    ...workflowUiAliases,
    // Tsconfig path aliases → webpack aliases
    // The @ prefix maps to packages/ directories
    '@ui': path.join(packagesRoot, 'ui'),
    '@ui-constants': path.join(packagesRoot, 'ui/constants'),
    '@components': path.join(packagesRoot, 'ui'),
    '@components/buttons/refresh/button-refresh/ButtonRefresh': path.join(
      packagesRoot,
      'ui/src/components/buttons/refresh/button-refresh/ButtonRefresh.tsx',
    ),
    '@components/cards/KpiCard': path.join(
      appDir,
      'packages/components/admin/cards/KpiCard.tsx',
    ),
    '@components/lazy/LazyModal': path.join(
      appDir,
      'packages/components/admin/lazy/LazyModal.ts',
    ),
    '@components/lazy/modal/LazyModal': path.join(
      packagesRoot,
      'ui/src/components/lazy/modal/LazyModal.tsx',
    ),
    '@components/loading/fallback/LazyLoadingFallback': path.join(
      packagesRoot,
      'ui/src/components/loading/fallback/LazyLoadingFallback.tsx',
    ),
    '@components/loading/skeleton/SkeletonFallbacks': path.join(
      packagesRoot,
      'ui/src/components/loading/skeleton/SkeletonFallbacks.tsx',
    ),
    '@components/modals/actions/ModalActions': path.join(
      packagesRoot,
      'ui/src/components/modals/actions/ModalActions.tsx',
    ),
    '@components/modals/modal/Modal': path.join(
      packagesRoot,
      'ui/src/components/modals/modal/Modal.tsx',
    ),
    '@components/modals/ModalRole': path.join(
      appDir,
      'packages/components/admin/modals/ModalRole.tsx',
    ),
    '@components/modals/ModalSubscription': path.join(
      appDir,
      'packages/components/admin/modals/ModalSubscription.tsx',
    ),
    '@components/social/SocialLinks': path.join(
      appDir,
      'packages/components/admin/social/SocialLinks.tsx',
    ),
    '@contexts': path.join(packagesRoot, 'contexts'),
    '@helpers': path.join(packagesRoot, 'helpers/src'),
    '@hooks': path.join(packagesRoot, 'hooks'),
    '@models': path.join(packagesRoot, 'models'),
    '@pages': path.join(packagesRoot, 'pages'),
    '@props': path.join(packagesRoot, 'props'),
    '@protected': path.join(appDir, 'app/(protected)/admin'),
    '@providers': path.join(packagesRoot, 'providers'),
    '@schemas': path.join(packagesRoot, 'schemas'),
    '@serializers': path.join(serializersRoot, 'src'),
    '@services': path.join(packagesRoot, 'services'),
    '@styles': path.join(packagesRoot, 'styles'),
    '@utils': path.join(packagesRoot, 'utils'),
    '@libs': path.join(packagesRoot, 'libs'),
    '@cloud-types': path.join(packagesRoot, 'types/src'),
    '@ui/forms/base/form-control/FormControl': path.join(
      packagesRoot,
      'ui/src/primitives/field.tsx',
    ),
  };
  nextConfig.resolve.extensions = [
    ...(nextConfig.resolve.extensions ?? []),
    '.css',
  ];

  // Add packages root to resolve.modules so @ui/*, @services/*, etc. resolve
  // via directory structure (packages/ui/*, packages/services/*, etc.)
  nextConfig.resolve.modules = [
    ...(nextConfig.resolve.modules ?? []),
    packagesRoot,
    path.resolve(appDir, '../../node_modules'),
    'node_modules',
  ];

  return nextConfig;
}) as NextConfig['webpack'];

// E2E code-coverage runs against a production build need browser source maps so
// monocart can map executed bytes back to TypeScript. Gated on E2E_COVERAGE so
// normal builds are unaffected. (Dev mode already emits source maps.)
if (process.env.E2E_COVERAGE === '1') {
  config.productionBrowserSourceMaps = true;
}

export default withBundleAnalyzer(config);
