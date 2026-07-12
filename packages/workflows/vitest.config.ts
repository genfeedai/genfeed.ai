import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
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
      {
        find: /^@genfeedai\/ui$/,
        replacement: path.resolve(__dirname, '../ui/src/index.ts'),
      },
      {
        find: /^@genfeedai\/ui\/(.*)$/,
        replacement: path.resolve(__dirname, '../ui/src/$1'),
      },
    ],
  },
  test: {
    // Whole-package jsdom: the /ui React specs need a DOM, and jsdom is a
    // superset the engine/nodes/generation logic specs run fine under.
    // (vitest 4 removed environmentMatchGlobs.)
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
  },
});
