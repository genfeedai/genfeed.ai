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
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', '__tests__/**/*.ts'],
    passWithNoTests: true,
    testTimeout: 10000,
  },
});
