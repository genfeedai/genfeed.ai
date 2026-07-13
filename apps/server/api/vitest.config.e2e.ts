import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const serviceDir = path.dirname(fileURLToPath(import.meta.url));

const coverageDirectory = path.resolve(serviceDir, './coverage-e2e');
fs.mkdirSync(path.join(coverageDirectory, '.tmp'), { recursive: true });

export default defineConfig({
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
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
        replacement: path.resolve(serviceDir, './src'),
      },
      {
        find: '@api-test',
        replacement: path.resolve(serviceDir, './test'),
      },
      {
        find: '@genfeedai/server',
        replacement: path.resolve(serviceDir, '../server/src'),
      },
      {
        find: /^@genfeedai\/server\/(.*)$/,
        replacement: path.resolve(serviceDir, '../server/src/$1'),
      },
      {
        find: '@server',
        replacement: path.resolve(serviceDir, '../server/src'),
      },
      {
        find: /^@server\/(.*)$/,
        replacement: path.resolve(serviceDir, '../server/src/$1'),
      },
      {
        find: '@credits',
        replacement: path.resolve(serviceDir, './src/collections/credits'),
      },
      {
        find: /^@credits\/(.*)$/,
        replacement: path.resolve(serviceDir, './src/collections/credits/$1'),
      },
      {
        find: /^@customers\/(.*)$/,
        replacement: path.resolve(serviceDir, './src/collections/customers/$1'),
      },
      {
        find: '@files',
        replacement: path.resolve(serviceDir, '../files/src'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/constants/src',
        ),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(serviceDir, '../../../packages/enums/src'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(serviceDir, '../../../packages/helpers/src'),
      },
      {
        find: '@genfeedai/harness',
        replacement: path.resolve(serviceDir, '../../../packages/harness/src'),
      },
      {
        find: /^@genfeedai\/harness\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/harness/src/$1',
        ),
      },
      {
        find: '@genfeedai/prisma',
        replacement: path.resolve(serviceDir, '../../../packages/prisma/src'),
      },
      {
        find: '@genfeedai/types',
        replacement: path.resolve(serviceDir, '../../../packages/types/src'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/interfaces/src/$1',
        ),
      },
      {
        find: '@genfeedai/interfaces',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/interfaces/src',
        ),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(serviceDir, '../../../packages/config/src'),
      },
      {
        find: '@genfeedai/pricing',
        replacement: path.resolve(serviceDir, '../../../packages/pricing/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/config/src/$1',
        ),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/integrations/src',
        ),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src',
        ),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflows',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflows/src',
        ),
      },
      {
        find: /^@genfeedai\/workflows\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflows/src/$1',
        ),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/integrations/src/$1',
        ),
      },
      {
        find: '@helpers',
        replacement: path.resolve(serviceDir, './src/helpers'),
      },
      {
        find: '@libs',
        replacement: path.resolve(serviceDir, '../../../packages/libs'),
      },
      {
        find: /^@genfeedai\/ee-billing\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../ee/packages/billing/src/$1',
        ),
      },
      {
        find: '@genfeedai/ee-billing',
        replacement: path.resolve(
          serviceDir,
          '../../../ee/packages/billing/src',
        ),
      },
      {
        find: '@test',
        replacement: path.resolve(serviceDir, './test'),
      },
      {
        find: /^@test\/(.*)$/,
        replacement: path.resolve(serviceDir, './test/$1'),
      },
      {
        // Mirrors the webpack/tsconfig `@billing-providers` alias for API E2E:
        // OSS CI resolves billing collection modules to the in-tree stub
        // fragment while EE billing remains covered by its own package tests.
        find: '@billing-providers',
        replacement: path.resolve(
          serviceDir,
          './src/common/subscriptions/billing.providers.oss.ts',
        ),
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
    maxWorkers: 1,
    pool: 'threads',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 60000,
  },
});
