import path from 'node:path';
import { createAppNextConfig } from '@genfeedai/next-config';
import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  analyzerMode: process.env.BUNDLE_ANALYZE === 'json' ? 'json' : 'static',
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});
const helpersRoot = path.resolve(__dirname, '../../packages/helpers');
const typesRoot = path.resolve(__dirname, '../../packages/types');

const config = createAppNextConfig({
  appName: 'admin',
  redirects: async () => [
    {
      destination: '/login',
      permanent: true,
      source: '/sign-in',
    },
    {
      destination: '/overview/dashboard',
      permanent: true,
      source: '/',
    },
    {
      destination: '/overview/analytics/all',
      permanent: true,
      source: '/overview/analytics',
    },
    {
      destination: '/configuration/elements/blacklists',
      permanent: true,
      source: '/configuration/elements',
    },
    {
      destination: '/content/ingredients/videos',
      permanent: true,
      source: '/content/ingredients',
    },
    {
      destination: '/automation/models/all',
      permanent: true,
      source: '/automation/models',
    },
    {
      destination: '/content/prompts/list',
      permanent: true,
      source: '/content/prompts',
    },
    {
      destination: '/configuration/tags/all',
      permanent: true,
      source: '/configuration/tags',
    },
    {
      destination: '/automation/trainings/:id/images',
      permanent: true,
      source: '/automation/trainings/:id',
    },
    {
      destination: '/overview/dashboard',
      permanent: true,
      source: '/overview',
    },
    {
      destination: '/content/posts',
      permanent: true,
      source: '/content',
    },
    {
      destination: '/automation/models',
      permanent: true,
      source: '/automation',
    },
    {
      destination: '/configuration/elements/blacklists',
      permanent: true,
      source: '/configuration',
    },
    {
      destination: '/administration/users',
      permanent: true,
      source: '/administration',
    },
  ],
  sentryProject: 'admin-genfeed-ai',
});

config.turbopack = {
  ...(config.turbopack ?? {}),
  resolveAlias: {
    ...(config.turbopack?.resolveAlias ?? {}),
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/types': '../../packages/types/src/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
  },
  root: path.resolve(__dirname, '../../..'),
};

config.transpilePackages = [
  ...(config.transpilePackages ?? []),
  '@genfeedai/client',
  '@genfeedai/serializers',
  '@genfeedai/types',
];

const serializersRoot = path.resolve(__dirname, '../../packages/serializers');
const existingWebpack = config.webpack;

config.webpack = ((webpackConfig, options) => {
  const nextConfig =
    typeof existingWebpack === 'function'
      ? existingWebpack(webpackConfig, options)
      : webpackConfig;

  nextConfig.resolve.alias = {
    ...nextConfig.resolve.alias,
    '@genfeedai/serializers': path.join(serializersRoot, 'src/index.ts'),
    '@genfeedai/types': path.join(typesRoot, 'src/index.ts'),
    '@genfeedai/helpers': path.join(helpersRoot, 'src/index.ts'),
    '@serializers': path.join(serializersRoot, 'src'),
  };

  return nextConfig;
}) as NextConfig['webpack'];

export default withBundleAnalyzer(config);
