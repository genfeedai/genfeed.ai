import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'clsx',
        replacement: path.resolve(
          __dirname,
          '../../node_modules/clsx/dist/clsx.mjs',
        ),
      },
      {
        find: '@components',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@ui-constants',
        replacement: path.resolve(__dirname, './constants'),
      },
      {
        find: '@contexts',
        replacement: path.resolve(__dirname, '../contexts'),
      },
      {
        find: '@genfeedai/agent',
        replacement: path.resolve(__dirname, '../agent/src'),
      },
      {
        find: /^@genfeedai\/agent\/(.*)$/,
        replacement: path.resolve(__dirname, '../agent/src/$1'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(__dirname, '../serializers/src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@hooks',
        replacement: path.resolve(__dirname, '../hooks'),
      },
      {
        find: '@models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: '@pages',
        replacement: path.resolve(__dirname, '../pages'),
      },
      {
        find: '@props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: '@providers',
        replacement: path.resolve(__dirname, '../providers'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: '@ui',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
      {
        find: 'tailwind-merge',
        replacement: path.resolve(
          __dirname,
          '../../node_modules/tailwind-merge/dist/bundle-mjs.mjs',
        ),
      },
      // Note: Removed testing-library redirect for now due to import issues
    ],
  },
  root: __dirname,
  // Force @tiptap deps through the Vite transform pipeline (CJS interop)
  // to fix broken ESM re-exports (e.g. Fragment6 as Fragment).
  ssr: {
    noExternal: [/@tiptap\/.*/],
  },
  test: {
    coverage: {
      clean: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.stories.*',
      ],
      include: ['**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
    },
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/.agents/**',
      '**/*.stories.*',
      '**/storybook-static/**',
      // next/dynamic + useEffect async imports trigger setState after jsdom teardown
      '**/MediaLightbox.test.tsx',
      // Audio hooks with useEffect + async playback cause worker fork timeout on cleanup
      '**/useModalGallery.test.ts',
    ],
    globals: true,
    hookTimeout: 15_000,
    // Now including all tests since we have proper test utilities
    include: ['**/*.{spec,test}.{ts,tsx}'],
    passWithNoTests: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
