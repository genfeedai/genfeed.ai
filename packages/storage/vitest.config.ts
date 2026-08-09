import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/config': path.resolve(__dirname, '../config/src/index.ts'),
    },
  },
  test: {
    coverage: {
      thresholds: { branches: 78, functions: 95, lines: 91, statements: 91 },
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      '__tests__/**/*.spec.ts',
      '__tests__/**/*.test.ts',
    ],
    passWithNoTests: true,
  },
});
