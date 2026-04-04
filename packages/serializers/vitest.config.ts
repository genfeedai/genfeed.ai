import path from 'node:path';
import { defineConfig } from 'vitest/config';

const SERIALIZERS_NODE_MODULES = path.resolve(__dirname, './node_modules');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../helpers/src/index.ts'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(
          SERIALIZERS_NODE_MODULES,
          '@genfeedai/constants/dist/index.js',
        ),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(
          SERIALIZERS_NODE_MODULES,
          '@genfeedai/enums/dist/index.js',
        ),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@cloud/serializers',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@genfeedai\/cloud-serializers\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
      {
        find: /^@serializers\/(.*)$/,
        replacement: path.resolve(__dirname, './src/$1'),
      },
    ],
  },
  test: {
    coverage: {
      exclude: ['src/**/*.d.ts', 'src/**/__tests__/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
      '__tests__/**/*.ts',
    ],
    passWithNoTests: true,
    testTimeout: 10000,
  },
});
