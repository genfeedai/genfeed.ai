import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/contracts/api-types',
        replacement: path.resolve(__dirname, 'src/api-types'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(__dirname, 'src/constants'),
      },
      {
        find: '@genfeedai/contracts/desktop',
        replacement: path.resolve(__dirname, 'src/desktop'),
      },
      {
        find: '@genfeedai/contracts/enums',
        replacement: path.resolve(__dirname, 'src/enums'),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(__dirname, 'src/interfaces'),
      },
      {
        find: '@genfeedai/contracts/queue',
        replacement: path.resolve(__dirname, 'src/queue'),
      },
      {
        find: '@genfeedai/contracts/types',
        replacement: path.resolve(__dirname, 'src/types'),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(__dirname, 'src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      '__tests__/**/*.test.ts',
      '__tests__/**/*.spec.ts',
    ],
    passWithNoTests: true,
    testTimeout: 10000,
  },
});
