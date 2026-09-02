import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

interface NextConfigAccessor {
  get(key: string): string | undefined;
}

interface AppNextConfigOptions {
  configAccessor?: NextConfigAccessor;
  env?: NextConfig['env'];
  headers?: NextConfig['headers'];
  output?: NextConfig['output'];
  redirects?: NextConfig['redirects'];
  rewrites?: NextConfig['rewrites'];
  sentryProject?: string;
}

export function createAppNextConfig(options: AppNextConfigOptions): NextConfig {
  const {
    configAccessor = { get: (key) => process.env[key] },
    env,
    headers,
    output,
    redirects,
    rewrites,
    sentryProject,
  } = options;

  const isProduction = process.env.NODE_ENV === 'production';
  const config: NextConfig = {
    // next 16.3+ writes a managed agent-rules block into CLAUDE.md / AGENTS.md
    // at the Next project root on `next dev`. Our agent rules live in
    // `.agents/memory/` and root CLAUDE.md — do not let Next mutate them.
    agentRules: false,
    // `**` (not `*`) is required: Next matches these patterns label-by-label
    // (next/dist/server/app-render/csrf-protection.js), so `*` consumes exactly
    // one label. Portless prefixes linked worktrees with the branch name, giving
    // hosts like `my-branch.app.genfeed.localhost` — two labels deep, which
    // `*.genfeed.localhost` rejects. Next then 403s every `/_next/*` dev
    // resource, hydration never runs, and the app renders as a blank shell.
    allowedDevOrigins: [
      '127.0.0.1',
      'genfeed.localhost',
      '**.genfeed.localhost',
      'localhost',
    ],
    distDir: process.env.NEXT_DIST_DIR || undefined,
    // Pin the file-tracing root to the monorepo root so production builds
    // (standalone / Vercel) trace workspace package files correctly instead of
    // inferring the root (which warns and can mis-bundle). cwd is the app dir
    // during `next build` / `next dev`, so two levels up is the repo root.
    outputFileTracingRoot: path.resolve(process.cwd(), '..', '..'),
    experimental: {
      // Hosted HTTP origins inline the Tailwind chunk to drop a render-blocking
      // round trip (#3287). Next file-tracing then pulls the monorepo CSS graph
      // into `output: 'standalone'` (Desktop QA: 90.7 MiB → 783 MiB). Desktop
      // builds set GENFEED_DESKTOP_BUNDLE=1 and keep the linked stylesheet.
      inlineCss: configAccessor.get('GENFEED_DESKTOP_BUNDLE') !== '1',
      // Do NOT add lucide-react here. Turbopack rewrites multi-alias default
      // re-exports (ChartColumn / BarChart3 → chart-column.mjs) into a broken
      // binding that crashes client render as "X is not a function".
      optimizePackageImports: [
        '@genfeedai/agent',
        '@genfeedai/client',
        '@genfeedai/contracts/constants',
        '@genfeedai/contracts',
        '@genfeedai/helpers',
        '@genfeedai/contracts/interfaces',
        '@genfeedai/serializers',
        '@genfeedai/contracts/types',
        '@genfeedai/ui',
        '@genfeedai/workflows',
        'date-fns',
        'recharts',
      ],
    },
    images: {
      // Media is pre-optimized and delivered through the Genfeed CloudFront
      // estate. Keep Next/Image layout semantics without routing requests
      // through Vercel Image Optimization and its separate usage billing.
      unoptimized: true,
      remotePatterns: [
        { hostname: '*.genfeed.ai' },
        // Portless serves ingredients from files.genfeed.localhost. Linked
        // worktrees prefix that host (`qa-local.files.genfeed.localhost`), so
        // `**` is required the same way allowedDevOrigins uses it. `*` alone
        // would still miss those deeper labels for some matchers.
        { hostname: '**.genfeed.localhost' },
        { hostname: '*.cloudfront.net' },
        { hostname: '*.amazonaws.com' },
        { hostname: 'avatars.githubusercontent.com' },
        { hostname: 'lh3.googleusercontent.com' },
        { hostname: 'images.unsplash.com' },
        { hostname: 'picsum.photos' },
        { hostname: 'i.pravatar.cc' },
        { hostname: '*.supabase.co' },
      ],
    },
    logging: {
      fetches: {
        fullUrl: false,
      },
    },
    reactStrictMode: true,
    serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
    transpilePackages: [
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
      '@genfeedai/contracts/constants',
      '@genfeedai/contracts',
      '@genfeedai/helpers',
      '@genfeedai/contracts/interfaces',
      '@genfeedai/workflows',
    ],
    // Skip type checking during build — handled by turbo typecheck separately
    typescript: {
      ignoreBuildErrors: true,
    },
    // Suppress noisy OpenTelemetry/Sentry instrumentation warnings
    webpack: (config) => {
      config.ignoreWarnings = [
        // OpenTelemetry dynamic requires
        { module: /@opentelemetry\/instrumentation/ },
        // require-in-the-middle dynamic requires
        { module: /require-in-the-middle/ },
        // Prisma instrumentation
        { module: /@prisma\/instrumentation/ },
      ];
      return config;
    },
  };

  if (env) {
    config.env = env;
  }

  if (headers) {
    config.headers = headers;
  }

  if (output) {
    config.output = output;
  }

  if (redirects) {
    config.redirects = redirects;
  }

  if (rewrites) {
    config.rewrites = rewrites;
  }

  // Only enable Sentry in production with auth token
  const resolvedSentryOrg = process.env.SENTRY_ORG || 'genfeedai';
  const resolvedSentryProject = process.env.SENTRY_PROJECT || sentryProject;
  const sentryEnabled =
    resolvedSentryProject && process.env.SENTRY_AUTH_TOKEN && isProduction;

  if (sentryEnabled) {
    return withSentryConfig(config, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: resolvedSentryOrg,
      project: resolvedSentryProject,
      release: {
        name: process.env.SENTRY_RELEASE || process.env.BUILD_ID,
      },
      silent: !process.env.CI,
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      webpack: {
        automaticVercelMonitors: true,
        treeshake: {
          removeDebugLogging: true,
        },
      },
      widenClientFileUpload: true,
    });
  }

  return config;
}
