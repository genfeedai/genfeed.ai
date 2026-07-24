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
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/enums/src/index.ts',
        ),
      },
      {
        find: '@config',
        replacement: path.resolve(serviceDir, './src/config'),
      },
      {
        find: '@controllers',
        replacement: path.resolve(serviceDir, './src/controllers'),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          serviceDir,
          '../../../packages/integrations/src',
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
      { find: '@telegram', replacement: path.resolve(serviceDir, './src') },
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
      thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
