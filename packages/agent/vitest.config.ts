import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@agent-tests': path.resolve(__dirname, './tests'),
      '@agent-tests/*': path.resolve(__dirname, './tests/*'),
      '@cloud/agent': path.resolve(__dirname, './src'),
      '@cloud/agent/*': path.resolve(__dirname, './src/*'),
      '@components': path.resolve(__dirname, '../ui'),
      '@contexts': path.resolve(__dirname, '../contexts'),
      '@helpers': path.resolve(__dirname, '../helpers/src'),
      '@hooks': path.resolve(__dirname, '../hooks'),
      '@models': path.resolve(__dirname, '../models'),
      '@pages': path.resolve(__dirname, '../pages'),
      '@services': path.resolve(__dirname, '../services'),
      '@ui': path.resolve(__dirname, '../ui'),
    },
  },
  root: __dirname,
  test: {
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
    exclude: ['**/node_modules/**', '**/.git/**', '**/.agents/**'],
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
  },
});
