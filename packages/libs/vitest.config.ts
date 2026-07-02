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
      '@genfeedai/config': path.resolve(pkgDir, '../config/src/index.ts'),
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
      thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
    },
    environment: 'node',
    globals: true,
    include: ['**/*.spec.ts', '**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30000,
  },
});
