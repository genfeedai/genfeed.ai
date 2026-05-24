import path from 'node:path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(__dirname, '../../..');
const packagesRoot = path.join(repoRoot, 'packages');

const nextConfig: NextConfig = {
  assetPrefix: './',
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  transpilePackages: [
    '@genfeedai/desktop-contracts',
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
