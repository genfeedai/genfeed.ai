import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../enums/src/index.ts'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
    ],
  },
  test: {
    coverage: {
      thresholds: { branches: 98, functions: 98, lines: 98, statements: 98 },
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: true,
  },
});
