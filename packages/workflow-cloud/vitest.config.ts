import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@helpers': path.resolve(__dirname, '../helpers/src'),
      '@hooks': path.resolve(__dirname, '../hooks'),
      '@providers': path.resolve(__dirname, '../providers'),
      '@services': path.resolve(__dirname, '../services'),
      '@ui': path.resolve(__dirname, '../ui'),
      '@workflow-cloud': path.resolve(__dirname, './src'),
      '@workflow-saas': path.resolve(__dirname, '../workflow-saas/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
  },
});
