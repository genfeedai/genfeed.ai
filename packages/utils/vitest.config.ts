import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@utils',
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
        find: '@genfeedai/props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: path.resolve(__dirname, '../props/$1'),
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
        find: '@props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '../services'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.ts', '**/*.spec.ts'],
    passWithNoTests: true,
  },
});
