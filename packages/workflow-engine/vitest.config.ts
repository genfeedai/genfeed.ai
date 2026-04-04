import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@cloud/workflow-engine',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
      {
        find: /^@workflow-engine\/(.*)$/,
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
