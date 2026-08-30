import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const serviceDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: false,
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
        find: '@server',
        replacement: path.resolve(serviceDir, './src'),
      },
      {
        find: /^@server\/(.*)$/,
        replacement: path.resolve(serviceDir, './src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(serviceDir, '../../../packages/helpers/src'),
      },
      {
        find: '@files',
        replacement: path.resolve(serviceDir, '../files/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/api-types/src/$1',
        ),
      },
      {
        find: '@api-types',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/api-types/src',
        ),
      },
      {
        find: /^@genfeedai\/actions\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/actions/src/$1',
        ),
      },
      {
        find: '@genfeedai/actions',
        replacement: path.resolve(serviceDir, '../../../packages/actions/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/config/src/$1',
        ),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(serviceDir, '../../../packages/config/src'),
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
        find: '@libs',
        replacement: path.resolve(serviceDir, '../../../packages/libs'),
      },
      {
        find: /^@libs\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/libs/$1'),
      },
    ],
  },
  test: {
    coverage: {
      exclude: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.spec.tsx',
        '**/*.test.tsx',
        '**/__tests__/**',
      ],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: { branches: 54, functions: 65, lines: 59, statements: 59 },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
