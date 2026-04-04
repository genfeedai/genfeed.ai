import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

interface PWAOptions {
  enabled?: boolean;
}

interface AppNextConfigOptions {
  appName: string;
  env?: NextConfig['env'];
  headers?: NextConfig['headers'];
  output?: NextConfig['output'];
  pwa?: PWAOptions;
  redirects?: NextConfig['redirects'];
  sentryProject?: string;
}

export function createAppNextConfig(options: AppNextConfigOptions): NextConfig {
  const {
    appName: _appName,
    env,
    headers,
    output,
    redirects,
    sentryProject,
  } = options;

  const isProduction = process.env.NODE_ENV === 'production';
  const config: NextConfig = {
    allowedDevOrigins: ['127.0.0.1', 'local.genfeed.ai', 'localhost'],
    distDir: process.env.NEXT_DIST_DIR || undefined,
    experimental: {
      optimizePackageImports: [
        '@genfeedai/constants',
        '@genfeedai/enums',
        '@genfeedai/helpers',
        '@radix-ui/react-icons',
        'date-fns',
        'lucide-react',
        'react-icons',
        'recharts',
      ],
    },
    images: {
      remotePatterns: [
        { hostname: '*.genfeed.ai' },
        { hostname: '*.cloudfront.net' },
        { hostname: '*.amazonaws.com' },
        { hostname: 'img.clerk.com' },
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
      '@genfeedai/constants',
      '@genfeedai/enums',
      '@genfeedai/helpers',
      '@genfeedai/interfaces',
      '@genfeedai/workflow-saas',
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
