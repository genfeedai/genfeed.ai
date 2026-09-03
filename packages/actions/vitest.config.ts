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
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/api-types/$1'),
      },
    ],
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
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: { branches: 93, functions: 98, lines: 96, statements: 96 },
    },
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'scripts/**/*.test.ts',
      'scripts/**/*.spec.ts',
    ],
    passWithNoTests: true,
  },
});
