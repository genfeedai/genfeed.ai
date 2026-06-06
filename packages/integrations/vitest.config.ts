import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../config/src'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../enums/src'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/src/$1'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../config/src/$1'),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
    ],
  },
  test: {
    coverage: {
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/index.ts',
        'src/**/types.ts',
        'src/**/*.types.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Ratchet floor at current actual (~87.7% lines / ~77% branches).
      // Raise toward 100 as http-client + provider.schema gaps fill.
      thresholds: {
        branches: 75,
        functions: 90,
        lines: 85,
        statements: 85,
      },
    },
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
    ],
    testTimeout: 10000,
  },
});
