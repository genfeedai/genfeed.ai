import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { decorators: true, syntax: 'typescript' },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    // Array format preserves ordering — @slack/bolt MUST precede @slack
    // to prevent prefix interception. Do NOT convert to object format.
    alias: [
      {
        find: '@slack/bolt',
        replacement: path.resolve(__dirname, './test/__mocks__/slack-bolt.ts'),
      },
      { find: '@slack', replacement: path.resolve(__dirname, './src') },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          __dirname,
          '../../../packages/integration-common/src',
        ),
      },
      {
        find: /^@genfeedai\/integration-common\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/integration-common/src/$1',
        ),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/integration-common/src/$1',
        ),
      },
      {
        find: '@controllers',
        replacement: path.resolve(__dirname, './src/controllers'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, './src/services'),
      },
      { find: '@shared', replacement: path.resolve(__dirname, './src/shared') },
      { find: '@config', replacement: path.resolve(__dirname, './src/config') },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      { find: '@', replacement: path.resolve(__dirname, './src') },
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
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
