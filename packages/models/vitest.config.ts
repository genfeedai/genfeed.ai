import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@models',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@genfeedai/client',
        replacement: path.resolve(__dirname, '../client/src'),
      },
      {
        find: /^@genfeedai\/client\/(.*)$/,
        replacement: path.resolve(__dirname, '../client/src/$1'),
      },
      {
        find: '@genfeedai/constants',
        replacement: require.resolve('@genfeedai/constants'),
      },
      {
        find: '@genfeedai/enums',
        replacement: require.resolve('@genfeedai/enums'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/interfaces',
        replacement: path.resolve(__dirname, '../interfaces/src'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(__dirname, '../interfaces/src/$1'),
      },
      {
        find: '@genfeedai/services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '../services/$1'),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(__dirname, '../utils/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
    ],
  },
  test: {
    globals: true,
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: true,
  },
});
