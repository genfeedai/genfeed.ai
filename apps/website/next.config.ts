import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppNextConfig } from '@genfeedai/next-config';
import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const withBundleAnalyzer = bundleAnalyzer({
  analyzerMode: process.env.BUNDLE_ANALYZE === 'json' ? 'json' : 'static',
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});
const websiteDir = path.dirname(fileURLToPath(import.meta.url));
const helpersRoot = path.resolve(websiteDir, '../../packages/helpers');
const enumsRoot = path.resolve(websiteDir, '../../packages/enums');

const config = createAppNextConfig({
  appName: 'website',
  headers: async () => [
    {
      headers: [
        {
          key: 'Link',
          value: [
            '<https://genfeed.ai/sitemap.xml>; rel="sitemap"',
            '<https://genfeed.ai/llms.txt>; rel="describedby"; type="text/plain"',
            '<https://genfeed.ai/llms-full.txt>; rel="describedby"; type="text/plain"',
          ].join(', '),
        },
        {
          key: 'X-Robots-Tag',
          value: 'index, follow, AI-index',
        },
      ],
      source: '/(.*)',
    },
  ],
  redirects: async () => [
    {
      destination: '/pricing',
      permanent: true,
      source: '/core',
    },
    {
      destination: '/pricing',
      permanent: true,
      source: '/host',
    },
    {
      destination: '/use-cases/creators',
      permanent: true,
      source: '/creators',
    },
    {
      destination: '/use-cases/agencies',
      permanent: true,
      source: '/agencies',
    },
    {
      destination: '/use-cases/ai-influencers',
      permanent: true,
      source: '/influencers',
    },
    {
      destination: '/use-cases/:slug',
      permanent: true,
      source: '/for/:slug',
    },
    {
      destination: '/use-cases/creators',
      permanent: true,
      source: '/for',
    },
  ],
  sentryProject: 'genfeed-ai',
});
config.logging = {
  fetches: {
    fullUrl: false,
  },
};

config.turbopack = {
  ...(config.turbopack ?? {}),
  resolveAlias: {
    ...(config.turbopack?.resolveAlias ?? {}),
    '@genfeedai/constants': '../../packages/constants/src/index.ts',
    '@genfeedai/enums': '../../packages/enums/src/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
    '@genfeedai/interfaces': '../../packages/interfaces/src/index.ts',
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/types': '../../packages/types/src/index.ts',
  },
  root: path.resolve(websiteDir, '../..'),
};

config.transpilePackages = [
  '@genfeedai/client',
  '@genfeedai/types',
  '@genfeedai/serializers',
  '@genfeedai/constants',
  '@genfeedai/enums',
  '@genfeedai/helpers',
  '@genfeedai/interfaces',
];

const serializersRoot = path.resolve(websiteDir, '../../packages/serializers');
const existingWebpack = config.webpack;

config.webpack = ((webpackConfig, options) => {
  const nextConfig =
    typeof existingWebpack === 'function'
      ? existingWebpack(webpackConfig, options)
      : webpackConfig;

  nextConfig.resolve.alias = {
    ...nextConfig.resolve.alias,
    '@genfeedai/enums': path.join(enumsRoot, 'src/index.ts'),
    '@genfeedai/serializers': path.join(serializersRoot, 'src/index.ts'),
    '@genfeedai/types': path.join(
      websiteDir,
      '../../packages/types/src/index.ts',
    ),
    '@genfeedai/helpers': path.join(helpersRoot, 'src/index.ts'),
    '@serializers': path.join(serializersRoot, 'src'),
  };

  return nextConfig;
}) as NextConfig['webpack'];

export default withBundleAnalyzer(config);
