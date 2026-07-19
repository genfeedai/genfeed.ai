import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(desktopDir, '../../..');
const packagesRoot = path.join(repoRoot, 'packages');

// Deterministic, empty-string-safe build id. A plain `??` chain does NOT skip
// empty strings, and CI/packaging envs can export these vars set-but-empty. An
// empty buildId makes Next.js embed "b":"" in RSC flight payloads, so the App
// Router treats every navigation as a cross-deployment change and forces a full
// hard reload. firstNonBlank skips blank/whitespace values; the dev-* fallback
// guarantees the id is never empty so generateBuildId never returns "".
const firstNonBlank = (
  ...values: Array<string | undefined>
): string | undefined => values.find((value) => value?.trim());

const buildId =
  firstNonBlank(
    process.env.BUILD_ID,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_ID,
  ) ?? `dev-${Date.now()}`;

const nextConfig: NextConfig = {
  assetPrefix: './',
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  generateBuildId: async () => {
    if (!buildId.trim()) {
      throw new Error(
        'generateBuildId: computed buildId is empty; refusing to build.',
      );
    }
    return buildId;
  },
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  transpilePackages: [
    '@genfeedai/agent',
    '@genfeedai/desktop-contracts',
    '@genfeedai/enums',
    '@genfeedai/helpers',
    '@genfeedai/hooks',
    '@genfeedai/interfaces',
    '@genfeedai/contexts',
    '@genfeedai/ui',
  ],
  turbopack: {
    root: repoRoot,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@components': path.join(packagesRoot, 'ui/src/components'),
      '@helpers': path.join(packagesRoot, 'helpers/src'),
      '@ui': path.join(packagesRoot, 'ui/src'),
      '@ui-constants': path.join(packagesRoot, 'ui/src/components/constants'),
    };

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },
};

export default nextConfig;
