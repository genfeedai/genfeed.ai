import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  oxc: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@ui': path.resolve(__dirname, '../../../../packages/ui/src'),
      '~': path.resolve(__dirname, './src'),
      '~components': path.resolve(__dirname, './src/components'),
      '~hooks': path.resolve(__dirname, './src/hooks'),
      '~models': path.resolve(__dirname, './src/models'),
      '~platforms': path.resolve(__dirname, './src/platforms'),
      '~popup': path.resolve(__dirname, './src/popup.tsx'),
      '~services': path.resolve(__dirname, './src/services'),
      '~store': path.resolve(__dirname, './src/store'),
      '~style.scss': path.resolve(__dirname, './src/style.scss'),
      '~utils': path.resolve(__dirname, './src/utils'),
    },
  },
  test: {
    coverage: {
      all: false,
      clean: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        'build/',
        '.plasmo/',
      ],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 9,
        functions: 8,
        lines: 12,
        statements: 12,
      },
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
