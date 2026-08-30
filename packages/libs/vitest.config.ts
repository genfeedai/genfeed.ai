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
    alias: {
      '@genfeedai/helpers/security/redact-sensitive-value.helper': path.resolve(
        pkgDir,
        '../helpers/src/security/redact-sensitive-value.helper.ts',
      ),
      '@genfeedai/config/deployment': path.resolve(
        pkgDir,
        '../config/src/deployment.ts',
      ),
      '@genfeedai/config': path.resolve(pkgDir, '../config/src/index.ts'),
      '@genfeedai/storage/path-containment': path.resolve(
        pkgDir,
        '../storage/src/path-containment.ts',
      ),
      '@genfeedai/storage': path.resolve(pkgDir, '../storage/src/index.ts'),
      '@libs': path.resolve(pkgDir, '.'),
    },
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
