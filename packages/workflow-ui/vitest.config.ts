import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/core$/,
        replacement: path.resolve(__dirname, '../core/src/index.ts'),
      },
      {
        find: /^@genfeedai\/core\/(.*)$/,
        replacement: path.resolve(__dirname, '../core/src/$1'),
      },
      {
        find: /^@genfeedai\/constants$/,
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../constants/src/$1'),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: path.resolve(__dirname, '../enums/src/index.ts'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/src/$1'),
      },
      {
        find: /^@genfeedai\/interfaces$/,
        replacement: path.resolve(__dirname, '../interfaces/src/index.ts'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(__dirname, '../interfaces/src/$1'),
      },
      {
        find: /^@genfeedai\/pricing$/,
        replacement: path.resolve(__dirname, '../pricing/src/index.ts'),
      },
      {
        find: /^@genfeedai\/pricing\/(.*)$/,
        replacement: path.resolve(__dirname, '../pricing/src/$1'),
      },
      {
        find: /^@genfeedai\/types$/,
        replacement: path.resolve(__dirname, '../types/src/index.ts'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(__dirname, '../types/src/$1'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
