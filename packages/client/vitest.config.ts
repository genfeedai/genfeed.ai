import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../constants/src/$1'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../enums/src/index.ts'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/src/$1'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/client',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/client\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
    ],
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
