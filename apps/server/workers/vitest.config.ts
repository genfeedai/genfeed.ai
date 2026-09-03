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
        find: '@config',
        replacement: path.resolve(serviceDir, './src/config'),
      },
      { find: '@files', replacement: path.resolve(serviceDir, '../files/src') },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(serviceDir, '../../../packages/config/src'),
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
        find: '@genfeedai/harness',
        replacement: path.resolve(serviceDir, '../../../packages/harness/src'),
      },
      {
        find: '@genfeedai/pricing',
        replacement: path.resolve(serviceDir, '../../../packages/pricing/src'),
      },
      {
        find: '@genfeedai/storage/path-containment',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/storage/src/path-containment.ts',
        ),
      },
      {
        find: '@genfeedai/storage',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/storage/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/harness\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/harness/src/$1',
        ),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/helpers/src/$1',
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
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/integrations/src',
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
        find: '@genfeedai/contracts/api-types/contracts',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/api-types/contracts',
        ),
      },
      {
        find: '@genfeedai/contracts/api-types',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/contracts/src/api-types',
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
        find: '@genfeedai/serializers',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src',
        ),
      },
      {
        find: /^@genfeedai\/serializers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/serializers/src/$1',
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
        find: '@genfeedai/utils',
        replacement: path.resolve(serviceDir, '../../../packages/utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/utils/$1'),
      },
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
        // Cron sources are measured by vitest.cron.config.ts (`test:cron:cov`).
        // Counting them here understated this config's own surface (#2687).
        'src/crons/**',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Floors for the non-cron workers surface only. Cron specs stay on
      // `bun run test:cron` / `test:cron:cov` because they pull cross-service
      // integrations. Raise toward the measured ~94/90 once a coverage run
      // confirms the new include set; do not lower these without an issue.
      thresholds: { branches: 35, functions: 49, lines: 40, statements: 40 },
    },
    environment: 'node',
    // Cron specs pull cross-service integrations (including @api modules).
    // Keep default workers tests fast/stable and run cron specs via `bun run test:cron`.
    exclude: ['src/crons/**/*.spec.ts'],
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
