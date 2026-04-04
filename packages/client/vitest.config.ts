import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(__dirname, '../constants/dist'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(__dirname, '../enums/dist'),
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
