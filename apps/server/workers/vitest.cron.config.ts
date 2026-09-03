import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const serviceDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
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
      { find: '@', replacement: path.resolve(serviceDir, './src') },
      { find: '@api', replacement: path.resolve(serviceDir, '../api/src') },
      {
        find: '@config',
        replacement: path.resolve(serviceDir, './src/config'),
      },
      { find: '@files', replacement: path.resolve(serviceDir, '../files/src') },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/constants/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/contracts/types',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/types',
        ),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/types/$1',
        ),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/interfaces',
        ),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/interfaces/$1',
        ),
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
        find: '@genfeedai/contracts/queue',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/queue',
        ),
      },
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/api-types/$1',
        ),
      },
      {
        find: /^@genfeedai\/queue-contracts\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/queue/$1',
        ),
      },
      {
        find: '@genfeedai/actions',
        replacement: path.resolve(serviceDir, '../../../packages/actions/src'),
      },
      {
        find: /^@genfeedai\/actions\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/actions/src/$1',
        ),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(serviceDir, '../../../packages/utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/utils/$1'),
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
        find: '@helpers',
        replacement: path.resolve(serviceDir, '../../../packages/helpers/src'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(serviceDir, '../../../packages/helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/helpers/src/$1',
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
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(serviceDir, '../../../packages/libs'),
      },
      {
        find: '@services',
        replacement: path.resolve(serviceDir, './src/services'),
      },
      {
        find: '@shared',
        replacement: path.resolve(serviceDir, './src/shared'),
      },
      { find: '@workers', replacement: path.resolve(serviceDir, './src') },
    ],
  },
  test: {
    coverage: {
      exclude: [
        'src/crons/**/*.spec.ts',
        'src/crons/**/*.module.ts',
        'src/crons/**/index.ts',
      ],
      include: ['src/crons/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage-cron',
      // First floor for the cron-only config (#2687). Raise after a real
      // `bun run test:cron:cov` measurement; do not lower without an issue.
      thresholds: { branches: 20, functions: 25, lines: 25, statements: 25 },
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.git/**'],
    globals: true,
    include: ['src/crons/**/*.spec.ts'],
    passWithNoTests: false,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
