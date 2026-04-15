import path from 'node:path';
import { defineConfig } from 'vitest/config';

const CONSTANTS_SRC = path.resolve(__dirname, '../constants/src');
const ENUMS_SRC = path.resolve(__dirname, '../enums/src');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@props',
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
