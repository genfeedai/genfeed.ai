import path from 'node:path';
import type { NextConfig } from 'next';

const packagesRoot = path.resolve(__dirname, '../../packages');

const nextConfig: NextConfig = {
  assetPrefix: './',
  images: {
    unoptimized: true,
  },
  output: 'export',
  transpilePackages: [
    '@genfeedai/desktop-contracts',
    '@genfeedai/hooks',
    '@genfeedai/interfaces',
    '@genfeedai/providers',
    '@genfeedai/ui',
  ],
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@components': path.join(packagesRoot, 'ui/src/components'),
      '@helpers': path.join(packagesRoot, 'helpers/src'),
      '@ui': path.join(packagesRoot, 'ui/src'),
      '@ui-constants': path.join(packagesRoot, 'ui/src/components/constants'),
    };

    return config;
  },
};

export default nextConfig;
