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
    // Workspace links declared as turbo and `--affected` graph edges. The
    // consumers reach these packages through tsconfig `paths`, vitest aliases,
    // relative imports (`../../packages/libs/...`) or CSS `@import` of
    // `packages/styles/*.css`, which knip resolves as files, not as a use of
    // the dependency. Removing a link drops the edge, so a change in the
    // package stops marking its consumers affected and turbo no longer builds
    // the package first. `scripts/ci/spec-typecheck-scope.test.ts` enforces the
    // `@genfeedai/tsconfig` link. The list is explicit so a new link that
    // nothing reaches is still reported.
    '@genfeedai/api',
    '@genfeedai/client',
    '@genfeedai/config',
    '@genfeedai/helpers',
    '@genfeedai/libs',
    '@genfeedai/models',
    '@genfeedai/pricing',
    '@genfeedai/serializers',
    '@genfeedai/styles',
    '@genfeedai/tsconfig',
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
      // Root dependencies that only workspaces import, kept on purpose:
      // - The server webpack config (webpack.base.config.js) externalizes
      //   whatever sits in the root node_modules and resolves it from there at
      //   runtime, so the server runtime packages must stay hoisted at the
      //   root. A package missing from the root is bundled instead, which
      //   breaks native modules (bcrypt) and bare externals (class-transformer)
      //   under the default isolated install. Every workspace that imports
      //   them also declares them.
      // - The web next.config test pins one hoisted next-intl copy for
      //   turbopack (apps/web/next.config.test.ts).
      // - Root `overrides` sets `"socket.io": "$socket.io"`, which Bun resolves
      //   from this manifest's own dependency.
      ignoreDependencies: [
        '@aws-sdk/client-s3',
        '@aws-sdk/lib-storage',
        '@aws-sdk/s3-request-presigner',
        '@bull-board/api',
        '@bull-board/express',
        '@elevenlabs/elevenlabs-js',
        '@fal-ai/client',
        '@nestjs/axios',
        '@nestjs/cache-manager',
        '@nestjs/config',
        '@nestjs/passport',
        '@nestjs/platform-express',
        '@nestjs/platform-socket.io',
        '@nestjs/swagger',
        '@nestjs/websockets',
        '@sentry/nestjs',
        '@socket.io/redis-adapter',
        'api',
        'archiver',
        'axios',
        'bcrypt',
        'bullmq',
        'cache-manager',
        'class-transformer',
        'class-validator',
        'compression',
        'cookie-parser',
        'cron',
        'discord.js',
        'exceljs',
        'express',
        'express-rate-limit',
        'ffmpeg-static',
        'ffprobe-static',
        'form-data',
        'googleapis',
        'grammy',
        'handlebars',
        'helmet',
        'htmlparser2',
        'ioredis',
        'joi',
        'jsonapi-serializer',
        'jsonwebtoken',
        'luxon',
        'nanoid',
        'nest-winston',
        'next-intl',
        'p-limit',
        'passport',
        'passport-custom',
        'pino',
        'reflect-metadata',
        'replicate',
        'resend',
        'rxjs',
        'sanitize-html',
        'short-unique-id',
        'socket.io',
        'stripe',
        'uuid',
        // The server webpack config resolves modules from the root
        // node_modules, and the generated Prisma clients import
        // `@prisma/client/runtime` from there.
        '@prisma/client',
        // packages/ui imports both and declares them only as peers, so the
        // root pins the installed versions (the lockfile has an older
        // `@radix-ui/react-dialog` under `react-alert-dialog`).
        '@radix-ui/react-dialog',
        '@radix-ui/react-slot',
        // Loaded by name from `.secretlintrc.json`.
        '@secretlint/secretlint-rule-no-homedir',
        '@secretlint/secretlint-rule-preset-recommend',
        // `scripts/check-import-cycles.ts` loads it with `createRequire`.
        'madge',
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
        // Run by hand with bun (see the usage note in the script); nothing imports it.
        'scripts/run-schnell-ablation.ts',
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
      // `ui-bundle.cjs` bundles the preview UI from these paths. esbuild loads
      // `preview-client.tsx` as the bundle entry; the app only imports it as a
      // `?mcp-preview` string, so its own exports look unused.
      entry: [
        'src/main.ts',
        'src/ui/next-image.tsx',
        'src/ui/preview-client.tsx',
        'src/ui/preview.css',
      ],
      ignore: ['dist/**'],
      // Path aliases from tsconfig.preview.json (`@ui/*` to packages/ui,
      // `@preview-messages/ui` to the web messages), not packages.
      ignoreDependencies: [/^@ui\//, '@preview-messages/ui'],
    },
    'apps/server/notifications': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
      // The terminal gateway verifies sessions with packages/libs/auth, which
      // imports `jose`; the service bundles that source and declares it.
      ignoreDependencies: ['jose'],
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
      // `scripts/ui/build-extension-theme-css.ts` loads it with a
      // `createRequire` rooted in the extension.
      ignoreDependencies: ['postcss'],
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
      // The generated client under `generated/` imports `@prisma/client`.
      ignoreDependencies: ['@prisma/client'],
    },

    // Shared packages — barrel exports
    'packages/*': {
      entry: ['src/index.ts', 'src/**/*.ts', 'src/**/*.tsx'],
      ignore: ['dist/**', 'node_modules/**'],
      ignoreDependencies: [
        // `@ui/*` is a path alias for packages/ui, not a package.
        /^@ui\//,
        // packages/desktop-prisma: its generated client imports it.
        '@prisma/client',
        // packages/agent: `vitest/browser`, imported by the `*.browser.test.tsx`
        // files, is served by this package.
        '@vitest/browser',
        // packages/props: `remotion-version-contract.spec.ts` requires props
        // to pin the same `@remotion/player` version as the web app.
        '@remotion/player',
      ],
    },
  },
};

export default config;
