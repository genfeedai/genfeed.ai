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
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(serviceDir, './src') },
      {
        find: '@config',
        replacement: path.resolve(serviceDir, './src/config'),
      },
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
        find: '@controllers',
        replacement: path.resolve(serviceDir, './src/controllers'),
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
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          serviceDir,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(serviceDir, '../../../packages/libs'),
      },
      {
        find: '@notifications',
        replacement: path.resolve(serviceDir, './src'),
      },
      {
        find: '@services',
        replacement: path.resolve(serviceDir, './src/services'),
      },
      {
        find: '@shared',
        replacement: path.resolve(serviceDir, './src/shared'),
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
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 81, functions: 85, lines: 89, statements: 89 },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
