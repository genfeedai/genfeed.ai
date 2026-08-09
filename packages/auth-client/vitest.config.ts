import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/auth-client',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/auth-client\/(.*)$/,
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
      thresholds: { branches: 84, functions: 94, lines: 90, statements: 90 },
    },
    globals: true,
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
