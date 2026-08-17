import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextra from 'nextra';

const docsDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(docsDir, '../..');

const withNextra = nextra({
  contentDirBasePath: '/',
});

export default withNextra({
  agentRules: false,
  images: {
    // Documentation media is delivered by the existing CDN pipeline.
    unoptimized: true,
  },
  headers: async () => [
    {
      headers: [
        {
          key: 'Link',
          value: [
            '<https://docs.genfeed.ai/sitemap.xml>; rel="sitemap"',
            '<https://docs.genfeed.ai/llms.txt>; rel="describedby"; type="text/plain"',
            '<https://genfeed.ai/.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"',
          ].join(', '),
        },
        {
          key: 'Content-Signal',
          value: 'ai-train=no, search=yes, ai-input=yes',
        },
      ],
      source: '/(.*)',
    },
  ],
  reactStrictMode: true,
  rewrites: async () => [
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
  turbopack: {
    root: monorepoRoot,
  },
});
