import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// ee/packages/billing → repo root is three levels up (billing → packages → ee).
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '../../..');
const apiSrc = path.resolve(repoRoot, 'apps/server/api/src');
const pkg = (rel: string) => path.resolve(repoRoot, 'packages', rel);

export default defineConfig({
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          decorators: true,
          syntax: 'typescript',
        },
        target: 'es2020',
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    // Mirrors apps/server/api/vitest.config.ts so the EE billing specs resolve
    // the api source tree identically to how the SaaS webpack/tsconfig graph
    // does. The single deliberate divergence: `@billing-providers` points at the
    // EE DI fragment (not the OSS stub), because these specs exercise the
    // enterprise flavor. The api unit suite covers the OSS fragment.
    alias: [
      {
        find: '@api',
        replacement: apiSrc,
      },
      {
        find: '@billing-providers',
        replacement: path.resolve(packageDir, 'src/billing.providers.ee.ts'),
      },
      {
        find: '@credits',
        replacement: path.resolve(apiSrc, 'collections/credits'),
      },
      {
        find: '@files',
        replacement: path.resolve(repoRoot, 'apps/server/files/src'),
      },
      {
        find: '@genfeedai/constants',
        replacement: pkg('constants/src'),
      },
      {
        find: '@genfeedai/enums',
        replacement: pkg('enums/src'),
      },
      {
        find: '@genfeedai/types',
        replacement: pkg('types/src'),
      },
      {
        // Subpath regex must precede the bare alias so subpaths win.
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: pkg('interfaces/src/$1'),
      },
      {
        find: '@genfeedai/interfaces',
        replacement: pkg('interfaces/src'),
      },
      {
        find: '@genfeedai/config',
        replacement: pkg('config/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: pkg('config/src/$1'),
      },
      {
        find: '@genfeedai/pricing',
        replacement: pkg('pricing/src'),
      },
      {
        find: '@genfeedai/harness',
        replacement: pkg('harness/src'),
      },
      {
        find: /^@genfeedai\/harness\/(.*)$/,
        replacement: pkg('harness/src/$1'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: pkg('helpers/src'),
      },
      {
        find: '@genfeedai/utils',
        replacement: pkg('utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: pkg('utils/$1'),
      },
      {
        find: '@genfeedai/integrations',
        replacement: pkg('integrations/src'),
      },
      {
        find: '@genfeedai/serializers',
        replacement: pkg('serializers/src'),
      },
      {
        find: '@genfeedai/workflows',
        replacement: pkg('workflows/src'),
      },
      {
        find: /^@genfeedai\/workflows\/(.*)$/,
        replacement: pkg('workflows/src/$1'),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: pkg('serializers/src/$1'),
      },
      {
        find: '@genfeedai/workflow-engine',
        replacement: pkg('workflow-engine/src'),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: pkg('workflow-engine/src/$1'),
      },
      {
        find: /^@workflow-engine\/(.*)$/,
        replacement: pkg('workflow-engine/src/$1'),
      },
      {
        find: '@genfeedai/workflow-saas',
        replacement: pkg('workflow-saas/src'),
      },
      {
        find: /^@genfeedai\/workflow-saas\/(.*)$/,
        replacement: pkg('workflow-saas/src/$1'),
      },
      {
        find: /^@workflow-saas\/(.*)$/,
        replacement: pkg('workflow-saas/src/$1'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: pkg('serializers/src/$1'),
      },
      {
        find: '@helpers',
        replacement: pkg('helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: pkg('helpers/src/$1'),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: pkg('integrations/src/$1'),
      },
      {
        find: '@libs',
        replacement: pkg('libs'),
      },
      {
        find: /^@genfeedai\/ee-billing\/(.*)$/,
        replacement: path.resolve(packageDir, 'src/$1'),
      },
      {
        find: '@genfeedai/ee-billing',
        replacement: path.resolve(packageDir, 'src'),
      },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    include: ['src/**/*.spec.ts'],
    name: '@genfeedai/ee-billing-unit',
    passWithNoTests: true,
    // Reuse the api unit-test setup: it mocks @genfeedai/prisma + the pg adapter,
    // blocks real HTTP, and stubs the external service env vars the EE billing
    // service tree touches at import time (Stripe/legacy auth provider SDKs, etc.).
    setupFiles: [path.resolve(apiSrc, '../test/setup-unit.ts')],
    testTimeout: 30000,
  },
});
