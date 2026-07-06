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
        find: '@genfeedai/server-domain',
        replacement: path.resolve(serviceDir, '../domain/src'),
      },
      {
        find: /^@genfeedai\/server-domain\/(.*)$/,
        replacement: path.resolve(serviceDir, '../domain/src/$1'),
      },
      {
        find: '@server-domain',
        replacement: path.resolve(serviceDir, '../domain/src'),
      },
      {
        find: /^@server-domain\/(.*)$/,
        replacement: path.resolve(serviceDir, '../domain/src/$1'),
      },
      {
        find: '@billing-providers',
        replacement: path.resolve(
          serviceDir,
          '../api/src/common/subscriptions/billing.providers.oss.ts',
        ),
      },
      {
        find: '@config',
        replacement: path.resolve(serviceDir, './src/config'),
      },
      { find: '@files', replacement: path.resolve(serviceDir, '../files/src') },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/constants/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/enums/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/types',
        replacement: path.resolve(serviceDir, '../../../packages/types/src'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/types/src/$1'),
      },
      {
        find: '@genfeedai/interfaces',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/interfaces/src',
        ),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/interfaces/src/$1',
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
        find: '@genfeedai/queue-contracts',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/queue-contracts/src',
        ),
      },
      {
        find: /^@genfeedai\/queue-contracts\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/queue-contracts/src/$1',
        ),
      },
      {
        find: '@genfeedai/tools',
        replacement: path.resolve(serviceDir, '../../../packages/tools/src'),
      },
      {
        find: /^@genfeedai\/tools\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/tools/src/$1'),
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
        find: '@genfeedai/workflow-engine',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-engine/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: /^@workflow-engine\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-engine/src/$1',
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
        find: '@genfeedai/workflow-engine',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-engine/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-saas',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-saas/src',
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
        find: /^@genfeedai\/workflow-saas\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-saas/src/$1',
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
        find: /^@workflow-engine\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: /^@workflow-saas\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/workflow-saas/src/$1',
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
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.git/**'],
    globals: true,
    include: ['src/crons/**/*.spec.ts'],
    passWithNoTests: false,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
