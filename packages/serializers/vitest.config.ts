import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(
          __dirname,
          '../contracts/src/constants/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(__dirname, '../contracts/src/index.ts'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/interfaces/$1'),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(
          __dirname,
          '../contracts/src/interfaces/index.ts',
        ),
      },
      {
        find: '@genfeedai/pricing',
        replacement: path.resolve(__dirname, '../pricing/src/index.ts'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
    ],
  },
  test: {
    coverage: {
      // Nightly Coverage run 34119676939 (2026-09-07): 85.09% branches, 97.95%
      // functions. Floor ~2 points below the measured table, as packages/ui does.
      thresholds: { branches: 83, functions: 96, lines: 86, statements: 86 },
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
      '__tests__/**/*.ts',
    ],
    passWithNoTests: true,
    testTimeout: 10000,
  },
});
