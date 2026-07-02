import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const mcpDir = path.dirname(fileURLToPath(import.meta.url));

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
      { find: '@', replacement: path.resolve(mcpDir, './src') },
      { find: '@config', replacement: path.resolve(mcpDir, './src/config') },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(
          mcpDir,
          '../../../packages/constants/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(
          mcpDir,
          '../../../packages/enums/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/interfaces',
        replacement: path.resolve(
          mcpDir,
          '../../../packages/interfaces/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/ui\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/ui/src/$1'),
      },
      {
        find: /^@ui\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/ui/src/$1'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(mcpDir, '../../../packages/config/src'),
      },
      {
        find: '@genfeedai/pricing',
        replacement: path.resolve(
          mcpDir,
          '../../../packages/pricing/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/config/src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(mcpDir, '../../../packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/helpers/src/$1'),
      },
      {
        find: '@libs',
        replacement: path.resolve(mcpDir, '../../../packages/libs'),
      },
      { find: '@mcp', replacement: path.resolve(mcpDir, './src') },
      {
        find: '@services',
        replacement: path.resolve(mcpDir, './src/services'),
      },
      { find: '@shared', replacement: path.resolve(mcpDir, './src/shared') },
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
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
