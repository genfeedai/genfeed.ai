import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, 'src/index.ts'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
    ],
  },
  test: {
    coverage: {
      thresholds: { branches: 60, functions: 94, lines: 94, statements: 94 },
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    passWithNoTests: true,
  },
});
