import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const pkgDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgDir, '../../..');

export default defineConfig({
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
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
    // Mirrors apps/server/api/vitest.config.ts so ee-billing source — which
    // imports deep into @api services (cache, credits) and shared packages —
    // resolves identically when its specs are run standalone via turbo.
    alias: [
      {
        find: /^@api\/(.*)$/,
        replacement: path.resolve(repoRoot, 'apps/server/api/src/$1'),
      },
      {
        find: '@api',
        replacement: path.resolve(repoRoot, 'apps/server/api/src'),
      },
      {
        find: '@credits',
        replacement: path.resolve(
          repoRoot,
          'apps/server/api/src/collections/credits',
        ),
      },
      {
        find: '@files',
        replacement: path.resolve(repoRoot, 'apps/server/files/src'),
      },
      {
        find: /^@libs\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/libs/$1'),
      },
      {
        find: '@libs',
        replacement: path.resolve(repoRoot, 'packages/libs'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/helpers/src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(repoRoot, 'packages/helpers/src'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/serializers/src/$1'),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/integrations/src/$1'),
      },
      {
        find: /^@genfeedai\/prisma\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/prisma/src/$1'),
      },
      {
        find: '@genfeedai/prisma',
        replacement: path.resolve(repoRoot, 'packages/prisma/src'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/enums/src/$1'),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(repoRoot, 'packages/enums/src'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/constants/src/$1'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(repoRoot, 'packages/constants/src'),
      },
      {
        find: /^@genfeedai\/types\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/types/src/$1'),
      },
      {
        find: '@genfeedai/types',
        replacement: path.resolve(repoRoot, 'packages/types/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/config/src/$1'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(repoRoot, 'packages/config/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/helpers/src/$1'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(repoRoot, 'packages/helpers/src'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/utils/$1'),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(repoRoot, 'packages/utils'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/interfaces/src/$1'),
      },
      {
        find: '@genfeedai/interfaces',
        replacement: path.resolve(repoRoot, 'packages/interfaces/src'),
      },
      {
        find: /^@genfeedai\/integrations\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/integrations/src/$1'),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(repoRoot, 'packages/integrations/src'),
      },
      {
        find: /^@genfeedai\/serializers\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/serializers/src/$1'),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(repoRoot, 'packages/serializers/src'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    name: '@genfeedai/ee-billing',
    passWithNoTests: true,
    testTimeout: 30000,
  },
});
