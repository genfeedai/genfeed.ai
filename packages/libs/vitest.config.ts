import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const pkgDir = path.dirname(fileURLToPath(import.meta.url));

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
    alias: [
      {
        find: '@genfeedai/helpers/security/redact-sensitive-value.helper',
        replacement: path.resolve(
          pkgDir,
          '../helpers/src/security/redact-sensitive-value.helper.ts',
        ),
      },
      // Subpaths resolve to the source directory; only the bare specifier is
      // the barrel. Must precede the bare entry.
      {
        find: /^@genfeedai\/contracts\/constants\/(.*)$/,
        replacement: path.resolve(pkgDir, '../contracts/src/constants/$1'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(
          pkgDir,
          '../contracts/src/constants/index.ts',
        ),
      },
      {
        find: '@genfeedai/config/deployment',
        replacement: path.resolve(pkgDir, '../config/src/deployment.ts'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(pkgDir, '../config/src/index.ts'),
      },
      {
        find: '@genfeedai/storage/path-containment',
        replacement: path.resolve(pkgDir, '../storage/src/path-containment.ts'),
      },
      {
        find: '@genfeedai/storage',
        replacement: path.resolve(pkgDir, '../storage/src/index.ts'),
      },
      { find: '@libs', replacement: path.resolve(pkgDir, '.') },
    ],
  },
  test: {
    coverage: {
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**'],
      include: ['**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: { branches: 84, functions: 92, lines: 94, statements: 93 },
    },
    environment: 'node',
    globals: true,
    include: ['**/*.spec.ts', '**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30000,
  },
});
