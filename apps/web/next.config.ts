import path from 'node:path';
import { createAppNextConfig } from '@genfeedai/next-config';
import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  analyzerMode: process.env.BUNDLE_ANALYZE === 'json' ? 'json' : 'static',
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

const workflowUiRoot = path.resolve(
  __dirname,
  '../../packages/workflow-ui',
);
const helpersRoot = path.resolve(__dirname, '../../packages/helpers');
const serializersRoot = path.resolve(
  __dirname,
  '../../packages/serializers',
);

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

const config = createAppNextConfig({
  appName: 'app',
  pwa: { enabled: true },
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
      destination: '/settings/personal',
      permanent: false,
      source: '/settings',
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
      source: '/:orgSlug/:brandSlug/chat/:path*',
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

config.logging = {
  fetches: {
    fullUrl: false,
  },
};

config.turbopack = {
  ...(config.turbopack ?? {}),
  resolveAlias: {
    ...(config.turbopack?.resolveAlias ?? {}),
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
    // Tsconfig path aliases for Turbopack
    '@ui/*': '../../packages/ui/*',
    '@ui-constants/*': '../../packages/ui/constants/*',
    '@components/*': '../../packages/ui/*',
    '@contexts/*': '../../packages/contexts/*',
    '@helpers/*': '../../packages/helpers/src/*',
    '@hooks/*': '../../packages/hooks/*',
    '@models/*': '../../packages/models/*',
    '@pages/*': '../../packages/pages/*',
    '@props/*': '../../packages/props/*',
    '@providers/*': '../../packages/providers/*',
    '@schemas/*': '../../packages/schemas/*',
    '@serializers/*': '../../packages/serializers/src/*',
    '@services/*': '../../packages/services/*',
    '@styles/*': '../../packages/styles/*',
    '@utils/*': '../../packages/utils/*',
    '@libs/*': '../../packages/libs/*',
    '@cloud-types/*': '../../packages/types/src/*',
    '@api-types/*': '../../packages/api-types/src/*',
    '@app-components/*': './packages/components/*',
    '@app-config/*': './packages/config/*',
    '@app-server/*': './packages/server/*',
    '@app/*': './app/*',
    '@/*': './src/*',
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
  '@genfeedai/serializers',
  '@genfeedai/constants',
  '@genfeedai/enums',
  '@genfeedai/helpers',
  '@genfeedai/hooks',
  '@genfeedai/interfaces',
  '@genfeedai/types',
  '@genfeedai/workflow',
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
    '@genfeedai/serializers': path.join(serializersRoot, 'src/index.ts'),
    ...workflowUiAliases,
    // Tsconfig path aliases → webpack aliases
    // The @ prefix maps to packages/ directories
    '@ui': path.join(packagesRoot, 'ui'),
    '@ui-constants': path.join(packagesRoot, 'ui/constants'),
    '@components': path.join(packagesRoot, 'ui'),
    '@contexts': path.join(packagesRoot, 'contexts'),
    '@helpers': path.join(packagesRoot, 'helpers/src'),
    '@hooks': path.join(packagesRoot, 'hooks'),
    '@models': path.join(packagesRoot, 'models'),
    '@pages': path.join(packagesRoot, 'pages'),
    '@props': path.join(packagesRoot, 'props'),
    '@providers': path.join(packagesRoot, 'providers'),
    '@schemas': path.join(packagesRoot, 'schemas'),
    '@serializers': path.join(serializersRoot, 'src'),
    '@services': path.join(packagesRoot, 'services'),
    '@styles': path.join(packagesRoot, 'styles'),
    '@utils': path.join(packagesRoot, 'utils'),
    '@libs': path.join(packagesRoot, 'libs'),
    '@cloud-types': path.join(packagesRoot, 'types/src'),
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
