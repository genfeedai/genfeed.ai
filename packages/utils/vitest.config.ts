import path from 'node:path';
import { defineConfig } from 'vitest/config';

const CONSTANTS_SRC = path.resolve(__dirname, '../constants/src');
const ENUMS_SRC = path.resolve(__dirname, '../enums/src');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@genfeedai/constants',
        replacement: CONSTANTS_SRC,
      },
      {
        find: '@genfeedai/enums',
        replacement: ENUMS_SRC,
      },
      {
        find: '@genfeedai/props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: path.resolve(__dirname, '../props/$1'),
      },
      {
        find: '@genfeedai/services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: '@props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
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
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 80, functions: 88, lines: 89, statements: 90 },
    },
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: true,
  },
});
