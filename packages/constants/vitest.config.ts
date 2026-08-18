import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/constants': path.resolve(__dirname, 'src'),
      '@genfeedai/enums': path.resolve(__dirname, '../enums/src'),
      '@genfeedai/types': path.resolve(__dirname, '../types/src'),
    },
  },
  test: {
    coverage: {
      exclude: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.spec.tsx',
        '**/*.test.tsx',
        '**/__tests__/**',
      ],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 81, functions: 90, lines: 93, statements: 92 },
    },
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: true,
  },
});
