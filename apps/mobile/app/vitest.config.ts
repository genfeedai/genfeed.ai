import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@app': path.resolve(__dirname, './app'),
      '@hooks': path.resolve(__dirname, './hooks'),
      '@services': path.resolve(__dirname, './services'),
    },
  },
  test: {
    coverage: {
      clean: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '.expo/',
        'assets/',
      ],
      include: [
        'app/_layout.tsx',
        'app/index.tsx',
        'app/(protected)/_layout.tsx',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'services/**/*.{ts,tsx}',
      ],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 20,
        functions: 10,
        lines: 18,
        statements: 18,
      },
    },
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}', 'tests/**/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
