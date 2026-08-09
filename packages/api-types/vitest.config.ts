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
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/src/$1'),
      },
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
      {
        find: /^@genfeedai\/api-types\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
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
      thresholds: { branches: 83, functions: 91, lines: 91, statements: 90 },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', '__tests__/**/*.ts'],
    passWithNoTests: true,
    testTimeout: 10000,
  },
});
