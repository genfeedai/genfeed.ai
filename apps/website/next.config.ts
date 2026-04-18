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
    {
      destination: '/vs/canva',
      permanent: true,
      source: '/vs',
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
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/types': '../../packages/types/src/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
  },
  root: path.resolve(__dirname, '../../..'),
};

config.transpilePackages = [
  '@genfeedai/client',
  '@genfeedai/types',
  '@genfeedai/serializers',
  '@genfeedai/constants',
  '@genfeedai/helpers',
  '@genfeedai/interfaces',
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
    '@genfeedai/types': path.join(
      __dirname,
      '../../packages/types/src/index.ts',
    ),
    '@genfeedai/helpers': path.join(helpersRoot, 'src/index.ts'),
    '@serializers': path.join(serializersRoot, 'src'),
  };

  return nextConfig;
}) as NextConfig['webpack'];

export default withBundleAnalyzer(config);
