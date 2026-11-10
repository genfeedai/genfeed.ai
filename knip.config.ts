import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Globally ignore test files, type declarations, and config files
  ignore: [
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.tsx',
    '**/*.d.ts',
    '**/vitest.config.*',
    '**/jest.config.*',
    '**/webpack.config.*',
    '**/next.config.*',
    '**/tailwind.config.*',
    '**/postcss.config.*',
    '**/tsconfig*.json',
    '**/turbo.json',
    '**/sentry.*.config.*',
    '**/serwist.*',
    '**/.serwist/**',
  ],

  // Ignore these dependency categories (peer deps, optional deps)
  ignoreDependencies: [
    // Commonly used implicitly
    'typescript',
    'tsconfig-paths',
    '@types/*',
    // Build/bundle tools loaded via config
    'esbuild-loader',
    'null-loader',
    'source-map-support',
    'pino-pretty',
    // Turbo, husky, lint-staged — invoked by scripts/hooks
    'turbo',
    'husky',
    'lint-staged',
    // Playwright
    '@playwright/test',
    'playwright',
    // Serwist compiles apps/web/app/sw.ts through esbuild at request time
    // (`useNativeEsbuild: true`), so esbuild is never imported from source.
    'esbuild',
    // Peer dependency of @google/model-viewer (packages/ui ModelViewer); the
    // viewer imports it itself, so nothing in this repo does.
    'three',
  ],
  workspaces: {
    // Root
    '.': {
      entry: [
        'scripts/**/*.{ts,mts,mjs,cjs}',
        // Loaded by vitest and playwright config files, not imported.
        'tests/setup.ts',
        'playwright/configs/*.ts',
      ],
      ignore: [
        'dist/**',
        '.agents/**',
        '.claude/**',
        'playwright/e2e/**',
        'playwright/artifacts/**',
        'docker/**',
      ],
    },

    // Backend services — NestJS apps
    'apps/server/api': {
      entry: [
        'src/main.ts',
        // Run by webpack and vitest from their config files and package scripts.
        '*.webpack.config.cjs',
        'vitest.learning-runtime.config.ts',
        'src/seeds/*.entrypoint.ts',
        // `scripts/check-serializer-drift.ts` globs these to match each
        // Prisma-backed schema with its serializer. Nothing imports them.
        'src/**/schemas/*.schema.ts',
      ],
      ignore: ['dist/**', 'scripts/**'],
    },
    'apps/server/discord': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/files': {
      // Remotion bundles this by path in `remotion-renderer.service.ts`.
      entry: ['src/main.ts', 'src/remotion/index.tsx'],
      ignore: ['dist/**'],
    },
    'apps/server/mcp': {
      // `ui-bundle.cjs` bundles the preview UI from these paths.
      entry: ['src/main.ts', 'src/ui/next-image.tsx', 'src/ui/preview.css'],
      ignore: ['dist/**'],
    },
    'apps/server/notifications': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/slack': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/telegram': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/workers': {
      entry: [
        'src/main.ts',
        '*.webpack.config.cjs',
        'src/maintenance/*.entrypoint.ts',
      ],
      ignore: ['dist/**'],
    },

    // Frontend apps — Next.js
    'apps/web': {
      entry: [
        'app/**/*.{ts,tsx}',
        'packages/**/*.{ts,tsx}',
        // Aliased from `vitest.config.mts`.
        'tests/*.stub.ts',
      ],
      ignore: ['dist/**', '.next/**', 'node_modules/**'],
    },
    'apps/marketing': {
      entry: [
        'app/**/*.{ts,tsx}',
        'src/**/*.{ts,tsx}',
        'vitest.setup.ts',
        'scripts/*.ts',
      ],
      ignore: ['dist/**', '.next/**', 'node_modules/**'],
    },

    // Browser extension, desktop shell, docs and Prisma tooling: files loaded
    // from HTML pages, CSS imports and package scripts.
    'apps/extension': {
      entry: [
        'scripts/*.mjs',
        'src/tailwind.css',
        'src/theme/theme-prepaint.ts',
      ],
    },
    'apps/desktop': {
      entry: ['scripts/*.cjs'],
    },
    'apps/docs': {
      entry: ['content/**/_meta.ts'],
    },
    'packages/prisma': {
      // `scripts/*.ts` are run by hand against a development database.
      entry: ['src/index.ts', 'src/**/*.ts', 'scripts/*.ts'],
    },

    // Shared packages — barrel exports
    'packages/*': {
      entry: ['src/index.ts', 'src/**/*.ts', 'src/**/*.tsx'],
      ignore: ['dist/**', 'node_modules/**'],
    },
  },
};

export default config;
