import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(__dirname, '../contracts/src/index.ts'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(
          __dirname,
          '../contracts/src/constants/index.ts',
        ),
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
