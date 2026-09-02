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
const enumsRoot = path.resolve(
  websiteDir,
  '../../packages/contracts/src/enums',
);

const config = createAppNextConfig({
  headers: async () => [
    {
      headers: [
        {
          key: 'Content-Signal',
          value: 'ai-train=no, search=yes, ai-input=yes',
        },
        {
          key: 'Link',
          value: [
            '<https://genfeed.ai/sitemap.xml>; rel="sitemap"',
            '<https://genfeed.ai/llms.txt>; rel="describedby"; type="text/plain"',
            '<https://genfeed.ai/llms-full.txt>; rel="describedby"; type="text/plain"',
            '<https://api.genfeed.ai/v1/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
          ].join(', '),
        },
        {
          key: 'X-Robots-Tag',
          value: 'index, follow, AI-index',
        },
      ],
      source: '/(.*)',
    },
    {
      has: [
        {
          key: 'accept',
          type: 'header',
          value: '.*text/markdown.*',
        },
      ],
      headers: [
        {
          key: 'Vary',
          value:
            'Accept, Accept-Encoding, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch',
        },
      ],
      source: '/',
    },
  ],
  rewrites: async () => ({
    afterFiles: [],
    beforeFiles: [
      {
        destination: '/.well-known/agent-content/home',
        has: [
          {
            key: 'accept',
            type: 'header',
            value: '.*text/markdown.*',
          },
        ],
        source: '/',
      },
    ],
    fallback: [],
  }),
  redirects: async () => [
    {
      destination: 'https://api.genfeed.ai/v1/openapi.json',
      permanent: false,
      source: '/openapi.json',
    },
    {
      destination:
        'https://api.genfeed.ai/.well-known/oauth-authorization-server',
      permanent: false,
      source: '/.well-known/oauth-authorization-server',
    },
    {
      destination: '/analytics',
      permanent: true,
      source: '/intelligence',
    },
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
    '@genfeedai/contracts/constants':
      '../../packages/contracts/src/constants/index.ts',
    '@genfeedai/contracts': '../../packages/contracts/src/enums/index.ts',
    '@genfeedai/helpers': '../../packages/helpers/src/index.ts',
    '@genfeedai/contracts/interfaces':
      '../../packages/contracts/src/interfaces/index.ts',
    '@genfeedai/serializers': '../../packages/serializers/src/index.ts',
    '@genfeedai/contracts/types': '../../packages/contracts/src/types/index.ts',
  },
  root: path.resolve(websiteDir, '../..'),
};

config.transpilePackages = [
  '@genfeedai/client',
  '@genfeedai/contracts/types',
  '@genfeedai/serializers',
  '@genfeedai/contracts/constants',
  '@genfeedai/contracts',
  '@genfeedai/helpers',
  '@genfeedai/contracts/interfaces',
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
    '@genfeedai/contracts': path.join(enumsRoot, 'src/index.ts'),
    '@genfeedai/serializers': path.join(serializersRoot, 'src/index.ts'),
    '@genfeedai/contracts/types': path.join(
      websiteDir,
      '../../packages/contracts/src/types/index.ts',
    ),
    '@genfeedai/helpers': path.join(helpersRoot, 'src/index.ts'),
    '@serializers': path.join(serializersRoot, 'src'),
  };

  return nextConfig;
}) as NextConfig['webpack'];

export default withBundleAnalyzer(config);
