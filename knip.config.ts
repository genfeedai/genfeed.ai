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
    'ts-loader',
    'null-loader',
    'source-map-support',
    'pino-pretty',
    // Turbo, husky, lint-staged — invoked by scripts/hooks
    'turbo',
    'husky',
    'lint-staged',
    // Storybook addons
    '@storybook/*',
    'storybook',
    'chromatic',
    // Playwright
    '@playwright/test',
    'playwright',
    // Serwist
    '@serwist/next',
    'serwist',
  ],
  workspaces: {
    // Root
    '.': {
      entry: ['scripts/**/*.{ts,mts}'],
      ignore: [
        'dist/**',
        '.agents/**',
        '.claude/**',
        '.storybook/**',
        'e2e/**',
        'docker/**',
      ],
    },

    // Backend services — NestJS apps
    'apps/server/api': {
      entry: ['src/main.ts'],
      ignore: ['dist/**', 'scripts/**'],
    },
    'apps/server/clips': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/discord': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/fanvue': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/files': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/llm': {
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },
    'apps/server/mcp': {
      entry: ['src/main.ts'],
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
      entry: ['src/main.ts'],
      ignore: ['dist/**'],
    },

    // Frontend apps — Next.js
    'apps/app': {
      entry: ['app/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      ignore: ['dist/**', '.next/**', 'node_modules/**'],
    },
    'apps/admin': {
      entry: ['app/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      ignore: ['dist/**', '.next/**', 'node_modules/**'],
    },
    'apps/website': {
      entry: ['app/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      ignore: ['dist/**', '.next/**', 'node_modules/**'],
    },

    // Shared packages — barrel exports
    'packages/*': {
      entry: ['src/index.ts', 'src/**/*.ts', 'src/**/*.tsx'],
      ignore: ['dist/**', 'node_modules/**'],
    },
  },
};

export default config;
