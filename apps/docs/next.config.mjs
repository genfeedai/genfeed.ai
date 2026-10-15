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
  experimental: {
    // Nextra builds its own config, so this app never passes through
    // `createAppNextConfig()` and has to opt in separately. Inlining the
    // route's CSS into <head> drops the render-blocking stylesheet request
    // that otherwise gates first paint on every docs page.
    inlineCss: true,
  },
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
  redirects: async () => [
    {
      destination: '/self-host/installation',
      permanent: false,
      source: '/self-host',
    },
    { destination: '/', permanent: true, source: '/core' },
    {
      destination: '/self-host/installation',
      permanent: true,
      source: '/core/installation',
    },
    {
      destination: '/self-host/configuration',
      permanent: true,
      source: '/core/configuration',
    },
    {
      destination: '/self-host/architecture',
      permanent: true,
      source: '/core/execution-boundaries',
    },
    { destination: '/', permanent: true, source: '/core/self-hosted-vs-cloud' },
    {
      destination: '/self-host/installation#option-3-from-source-contributors',
      permanent: true,
      source: '/core/contributing',
    },
    { destination: '/', permanent: true, source: '/core/backlog-governance' },
    {
      destination: '/self-host/provider-registry',
      permanent: true,
      source: '/core/provider-registry',
    },
    { destination: '/', permanent: true, source: '/cloud' },
    { destination: '/', permanent: true, source: '/cloud/organizations' },
    { destination: '/', permanent: true, source: '/cloud/settings' },
    { destination: '/', permanent: true, source: '/cloud/team' },
    { destination: '/', permanent: true, source: '/cloud/billing' },
    { destination: '/guides/brands', permanent: true, source: '/cloud/brands' },
    { destination: '/guides/studio', permanent: true, source: '/cloud/studio' },
    {
      destination: '/self-host/installation',
      permanent: true,
      source: '/deployment',
    },
    {
      destination: '/self-host/reverse-proxy',
      permanent: true,
      source: '/deployment/production-readiness',
    },
    {
      destination: '/self-host/visual-code-renderer',
      permanent: true,
      source: '/deployment/visual-code-renderer',
    },
    {
      destination: '/self-host/after-it-is-running',
      permanent: true,
      source: '/getting-started',
    },
    {
      destination: '/self-host/installation',
      permanent: true,
      source: '/guides/self-host-quickstart',
    },
    { destination: '/', permanent: true, source: '/advanced/members-guide' },
  ],
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
