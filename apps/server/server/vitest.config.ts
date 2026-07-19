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
        find: /^@libs\/(.*)$/,
        replacement: path.resolve(serviceDir, '../../../packages/libs/$1'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    testTimeout: 30000,
  },
});
