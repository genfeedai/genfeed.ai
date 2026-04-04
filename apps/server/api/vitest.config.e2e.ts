import fs from 'node:fs';
import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const coverageDirectory = path.resolve(__dirname, './coverage-e2e');
fs.mkdirSync(path.join(coverageDirectory, '.tmp'), { recursive: true });

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          decorators: true,
          syntax: 'typescript',
        },
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@api',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: '@api-test',
        replacement: path.resolve(__dirname, './test'),
      },
      {
        find: '@credits',
        replacement: path.resolve(__dirname, './src/collections/credits'),
      },
      {
        find: /^@credits\/(.*)$/,
        replacement: path.resolve(__dirname, './src/collections/credits/$1'),
      },
      {
        find: /^@customers\/(.*)$/,
        replacement: path.resolve(__dirname, './src/collections/customers/$1'),
      },
      {
        find: '@files',
        replacement: path.resolve(__dirname, '../files/src'),
      },
      {
        find: '@genfeedai/types',
        replacement: path.resolve(__dirname, '../../../packages/types/src'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../../../packages/config/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../../../packages/config/src/$1'),
      },
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
        find: '@genfeedai/serializers',
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src',
        ),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-engine',
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: /^@workflow-engine\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-saas',
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-saas\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src/$1',
        ),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src/$1',
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
          '../../../packages/integration-common/src/$1',
        ),
      },
      {
        find: /^@workflow-saas\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src/$1',
        ),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, './src/helpers'),
      },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      {
        find: '@test',
        replacement: path.resolve(__dirname, './test'),
      },
      {
        find: /^@test\/(.*)$/,
        replacement: path.resolve(__dirname, './test/$1'),
      },
    ],
  },
  test: {
    coverage: {
      clean: false,
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.e2e-spec.ts',
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/**/*.module.ts',
        'src/**/*.d.ts',
        'src/main.ts',
        'src/instrument.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: coverageDirectory,
      thresholds: {
        branches: 50,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
    environment: 'node',
    globals: true,
    include: ['test/**/*.e2e-spec.ts', 'test/integration/**/*.spec.ts'],
    name: '@genfeedai/api-e2e',
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1,
      },
    },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 60000,
  },
});
