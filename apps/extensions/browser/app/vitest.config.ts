import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const extensionAppDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@hooks': path.resolve(extensionAppDir, './src/hooks'),
      '@ui': path.resolve(extensionAppDir, '../../../../packages/ui/src'),
      '~': path.resolve(extensionAppDir, './src'),
      '~components': path.resolve(extensionAppDir, './src/components'),
      '~hooks': path.resolve(extensionAppDir, './src/hooks'),
      '~models': path.resolve(extensionAppDir, './src/models'),
      '~platforms': path.resolve(extensionAppDir, './src/platforms'),
      '~popup': path.resolve(extensionAppDir, './src/popup.tsx'),
      '~services': path.resolve(extensionAppDir, './src/services'),
      '~store': path.resolve(extensionAppDir, './src/store'),
      '~style.css': path.resolve(extensionAppDir, './src/style.css'),
      '~utils': path.resolve(extensionAppDir, './src/utils'),
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
