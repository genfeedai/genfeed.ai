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
      // NOTE: do NOT alias @genfeedai/ui to its src — its source uses an internal
      // `@ui/*` alias the /ui specs can't resolve. Let it resolve via node_modules
      // to the built dist (turbo `test` dependsOn ^build), matching the former
      // standalone workflow UI package.
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
