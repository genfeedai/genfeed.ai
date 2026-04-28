import path from 'node:path';
import { createAppNextConfig } from '@genfeedai/next-config';
import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  analyzerMode: process.env.BUNDLE_ANALYZE === 'json' ? 'json' : 'static',
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const workflowUiRoot = path.resolve(__dirname, '../../packages/workflow-ui');
const helpersRoot = path.resolve(__dirname, '../../packages/helpers');
const serializersRoot = path.resolve(__dirname, '../../packages/serializers');
const desktopAuthRoot = path.resolve(__dirname, './src/lib/desktop-auth');
const isDesktopShellBuild = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
const hasClerkKeys =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);
const useClerkAuthShim = isDesktopShellBuild || !hasClerkKeys;

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

const IS_LOCAL_APP_SHELL = !process.env.NEXT_PUBLIC_GENFEED_CLOUD;
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
  ? ['chat', 'settings'].map((segment) => ({
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
      destination: '/chat/new',
      permanent: false,
      source: '/chat',
    },
    {
      destination: '/:orgSlug/~/chat/:path*',
      permanent: false,
      source: '/:orgSlug/:brandSlug([^~/][^/]*)/chat/:path*',
    },
    {
      destination: '/studio/image',
      permanent: false,
      source: '/studio',
    },
  ],
  sentryProject: 'app-genfeed-ai',
});
config.experimental = {
  ...(config.experimental ?? {}),
  optimizePackageImports: [
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
    path.resolve(__dirname, '../../node_modules'),
    path.resolve(__dirname, '../../packages/agent/node_modules'),
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
    ...(useClerkAuthShim
      ? {
          '@clerk/nextjs': './src/lib/desktop-auth/clerk-shim.tsx',
          '@clerk/nextjs/server': './src/lib/desktop-auth/clerk-server-shim.ts',
        }
      : {}),
    '@components/buttons/refresh/button-refresh/ButtonRefresh':
      '../../packages/ui/src/components/buttons/refresh/button-refresh/ButtonRefresh.tsx',
    '@components/cards/KpiCard':
      './packages/components/admin/cards/KpiCard.tsx',
    '@components/lazy/LazyModal':
      './packages/components/admin/lazy/LazyModal.tsx',
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
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
    '@protected': './app/(protected)/admin',
    '@serializers': '../../packages/serializers/src',
    '@ui/forms/base/form-control/FormControl':
      '../../packages/ui/src/primitives/field.tsx',
  },
  root: path.resolve(__dirname, '../..'),
};

config.transpilePackages = [
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

  const packagesRoot = path.resolve(__dirname, '../../packages');

  nextConfig.resolve.alias = {
    ...nextConfig.resolve.alias,
    ...(useClerkAuthShim
      ? {
          '@clerk/nextjs': path.join(desktopAuthRoot, 'clerk-shim.tsx'),
          '@clerk/nextjs/server': path.join(
            desktopAuthRoot,
            'clerk-server-shim.ts',
          ),
        }
      : {}),
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
      __dirname,
      'packages/components/admin/cards/KpiCard.tsx',
    ),
    '@components/lazy/LazyModal': path.join(
      __dirname,
      'packages/components/admin/lazy/LazyModal.tsx',
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
      __dirname,
      'packages/components/admin/modals/ModalRole.tsx',
    ),
    '@components/modals/ModalSubscription': path.join(
      __dirname,
      'packages/components/admin/modals/ModalSubscription.tsx',
    ),
    '@components/social/SocialLinks': path.join(
      __dirname,
      'packages/components/admin/social/SocialLinks.tsx',
    ),
    '@contexts': path.join(packagesRoot, 'contexts'),
    '@helpers': path.join(packagesRoot, 'helpers/src'),
    '@hooks': path.join(packagesRoot, 'hooks'),
    '@models': path.join(packagesRoot, 'models'),
    '@pages': path.join(packagesRoot, 'pages'),
    '@props': path.join(packagesRoot, 'props'),
    '@protected': path.join(__dirname, 'app/(protected)/admin'),
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
    path.resolve(__dirname, '../../node_modules'),
    'node_modules',
  ];

  return nextConfig;
}) as NextConfig['webpack'];

export default withBundleAnalyzer(config);
