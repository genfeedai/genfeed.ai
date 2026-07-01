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
        find: /^@genfeedai\/types$/,
        replacement: path.resolve(__dirname, '../types/src/index.ts'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(__dirname, '../types/src/$1'),
      },
      {
        find: '@genfeedai/workflow-saas',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/workflow-saas\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
      {
        find: /^@workflow-saas\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    testTimeout: 15000,
  },
});
