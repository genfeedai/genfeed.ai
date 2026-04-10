import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  plugins: [
    swc.vite({
      jsc: {
        parser: { decorators: true, syntax: 'typescript' },
        target: 'es2020',
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@api', replacement: path.resolve(__dirname, '../api/src') },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(
          __dirname,
          '../../../packages/constants/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(
          __dirname,
          '../../../packages/enums/src/index.ts',
        ),
      },
      { find: '@config', replacement: path.resolve(__dirname, './src/config') },
      { find: '@files', replacement: path.resolve(__dirname, '../files/src') },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../../../packages/config/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../../../packages/config/src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../../../packages/helpers/src'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../../../packages/helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          __dirname,
          '../../../packages/integrations/src',
        ),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/integrations/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, './src/services'),
      },
      { find: '@shared', replacement: path.resolve(__dirname, './src/shared') },
      { find: '@workers', replacement: path.resolve(__dirname, './src') },
    ],
  },
  test: {
    coverage: {
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.e2e-spec.ts',
        'src/**/test/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/*.module.ts',
        'src/main.ts',
        'src/instrument.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
    },
    environment: 'node',
    // Cron specs pull cross-service integrations (including @api modules).
    // Keep default workers tests fast/stable and run cron specs via `bun run test:cron`.
    exclude: ['src/crons/**/*.spec.ts'],
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    testTimeout: 30000,
  },
});
