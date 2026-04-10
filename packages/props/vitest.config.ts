import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@props',
        replacement: path.resolve(__dirname, '.'),
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
        find: '@genfeedai/models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: /^@genfeedai\/models\/(.*)$/,
        replacement: path.resolve(__dirname, '../models/$1'),
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
        find: '@models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
    ],
  },
  test: {
    globals: true,
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: true,
  },
});
