import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
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
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@api', replacement: path.resolve(__dirname, '../api/src') },
      { find: '@config', replacement: path.resolve(__dirname, './src/config') },
      { find: '@files', replacement: path.resolve(__dirname, '../files/src') },
      {
        find: '@genfeedai/types',
        replacement: path.resolve(__dirname, '../../../packages/types/src'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../../../packages/config/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../../../packages/config/src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../../../packages/helpers/src'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../../../packages/helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: '@genfeedai/integrations',
        replacement: path.resolve(
          __dirname,
          '../../../packages/integrations/src',
        ),
      },
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src',
        ),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-engine',
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-engine\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: '@genfeedai/workflow-saas',
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src',
        ),
      },
      {
        find: /^@genfeedai\/workflow-saas\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src/$1',
        ),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: /^@integrations\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/integrations/src/$1',
        ),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/serializers/src/$1',
        ),
      },
      {
        find: /^@workflow-engine\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-engine/src/$1',
        ),
      },
      {
        find: /^@workflow-saas\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/workflow-saas/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, './src/services'),
      },
      { find: '@shared', replacement: path.resolve(__dirname, './src/shared') },
      { find: '@workers', replacement: path.resolve(__dirname, './src') },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.git/**'],
    globals: true,
    include: ['src/crons/**/*.spec.ts'],
    passWithNoTests: false,
    testTimeout: 30000,
  },
});
