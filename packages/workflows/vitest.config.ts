import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/contracts\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/constants/$1'),
      },
      {
        // jsdom suites never load the Sentry bundles: the server entry throws
        // outside a file:// URL and the client entry needs next/router.
        find: /^@sentry\/nextjs$/,
        replacement: path.resolve(
          __dirname,
          '../config/test/sentry-nextjs.shim.ts',
        ),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: path.resolve(__dirname, '../contracts/src/index.ts'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/enums/$1'),
      },
      {
        find: /^@genfeedai\/interfaces$/,
        replacement: path.resolve(
          __dirname,
          '../contracts/src/interfaces/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/interfaces/$1'),
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
        replacement: path.resolve(__dirname, '../contracts/src/types/index.ts'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/types/$1'),
      },
      {
        // Components in `ui/src/components` import primitives through `@ui/*`
        // too, and `CopyButton` writes through the clipboard service and takes
        // its props from the props package.
        find: /^@ui\/primitives\/(.*)$/,
        replacement: path.resolve(__dirname, '../ui/src/primitives/$1'),
      },
      {
        find: /^@services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: /^@props\/(.*)$/,
        replacement: path.resolve(__dirname, '../props/$1'),
      },
      {
        // The video and media players are not part of the published `ui`
        // package, so the workflow nodes reach them through the same `@ui/*`
        // alias `packages/agent` and `apps/web` use.
        find: /^@ui\/(.*)$/,
        replacement: path.resolve(__dirname, '../ui/src/components/$1'),
      },
      // NOTE: do NOT alias @genfeedai/ui to its src — its source uses an internal
      // `@ui/*` alias the /ui specs can't resolve. Let it resolve via node_modules
      // to the built dist (turbo `test` dependsOn ^build), matching the former
      // standalone workflow UI package.
    ],
  },
  test: {
    coverage: {
      exclude: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.spec.tsx',
        '**/*.test.tsx',
        '**/__tests__/**',
      ],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Nightly Coverage run 34119676939 (2026-09-07): 80.62% branches. Floor ~2
      // points below the measured table, as packages/ui does.
      thresholds: { branches: 79, functions: 91, lines: 91, statements: 90 },
    },
    // Whole-package jsdom: the /ui React specs need a DOM, and jsdom is a
    // superset the engine/nodes/generation logic specs run fine under.
    // (vitest 4 removed environmentMatchGlobs.)
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
  },
});
