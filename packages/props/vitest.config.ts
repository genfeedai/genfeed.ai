import path from 'node:path';
import { defineConfig } from 'vitest/config';

const CONSTANTS_SRC = path.resolve(__dirname, '../contracts/src/constants');
const ENUMS_SRC = path.resolve(__dirname, '../contracts/src/enums');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@props',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: CONSTANTS_SRC,
      },
      {
        find: '@genfeedai/contracts',
        replacement: ENUMS_SRC,
      },
      {
        find: '@genfeedai/models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: /^@genfeedai\/models\/(.*)$/,
        replacement: path.resolve(__dirname, '../models/$1'),
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
        find: '@models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
    ],
  },
  test: {
    globals: true,
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: true,
  },
});
