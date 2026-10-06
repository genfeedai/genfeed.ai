import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const mcpDir = path.dirname(fileURLToPath(import.meta.url));

const { buildMcpPreview } = createRequire(import.meta.url)('./ui-bundle.cjs');

export default defineConfig({
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
  plugins: [
    {
      name: 'mcp-preview',
      enforce: 'pre',
      async load(id) {
        if (id.endsWith('?mcp-preview'))
          return `export default ${JSON.stringify(await buildMcpPreview())};`;
      },
    },
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
        find: /^@genfeedai\/actions$/,
        replacement: path.resolve(
          mcpDir,
          '../../../packages/actions/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/helpers$/,
        replacement: path.resolve(
          mcpDir,
          '../../../packages/helpers/src/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/contracts/src/$1'),
      },
      { find: '@', replacement: path.resolve(mcpDir, './src') },
      { find: '@config', replacement: path.resolve(mcpDir, './src/config') },
      {
        // Subpaths resolve to the source directory; only the bare specifier is
        // the barrel. Must precede the bare entry.
        find: /^@genfeedai\/contracts\/constants\/(.*)$/,
        replacement: path.resolve(
          mcpDir,
          '../../../packages/contracts/src/constants/$1',
        ),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(
          mcpDir,
          '../../../packages/contracts/src/constants/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(
          mcpDir,
          '../../../packages/contracts/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(
          mcpDir,
          '../../../packages/contracts/src/interfaces/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/utils/$1'),
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
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(mcpDir, '../../../packages/helpers/src/$1'),
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
      thresholds: { branches: 77, functions: 96, lines: 94, statements: 94 },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
