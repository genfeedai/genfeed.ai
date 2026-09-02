import path from 'node:path';
import { defineConfig } from 'vitest/config';

const CONSTANTS_SRC = path.resolve(__dirname, '../contracts/src/constants');
const CONFIG_SRC = path.resolve(__dirname, '../config/src');
const ENUMS_SRC = path.resolve(__dirname, '../contracts/src/enums');
const API_TYPES_SRC = path.resolve(__dirname, '../contracts/src/api-types');

export default defineConfig({
  resolve: {
    alias: [
      // IMPORTANT: More specific aliases must come before less specific ones
      // Mock canonical serializers to keep unit tests isolated from build-time wiring
      {
        find: '@genfeedai/serializers',
        replacement: path.resolve(__dirname, '__mocks__/serializers.mock.ts'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@genfeedai/services',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: /^@genfeedai\/services\/(.*)$/,
        replacement: path.resolve(__dirname, '$1'),
      },
      {
        find: /^@genfeedai\/config$/,
        replacement: path.resolve(CONFIG_SRC, 'index.ts'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(CONFIG_SRC, '$1'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: CONSTANTS_SRC,
      },
      {
        find: '@genfeedai/contracts',
        replacement: ENUMS_SRC,
      },
      {
        find: /^@api-types\/(.*)$/,
        replacement: path.resolve(API_TYPES_SRC, '$1'),
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
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(__dirname, '../contracts/src/interfaces'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/interfaces/$1'),
      },
      {
        find: '@genfeedai/pricing',
        replacement: path.resolve(__dirname, '../pricing/src/index.ts'),
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
        find: '@genfeedai/props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: /^@genfeedai\/props\/(.*)$/,
        replacement: path.resolve(__dirname, '../props/$1'),
      },
      {
        find: '@genfeedai/contracts/types',
        replacement: path.resolve(__dirname, '../contracts/src/types'),
      },
      {
        find: '@genfeedai/utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
      {
        find: /^@genfeedai\/utils\/(.*)$/,
        replacement: path.resolve(__dirname, '../utils/$1'),
      },
      // Legacy aliases for transitive deps (helpers/models/props/utils self-references)
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../helpers/src'),
      },
      {
        find: '@models',
        replacement: path.resolve(__dirname, '../models'),
      },
      {
        find: '@props',
        replacement: path.resolve(__dirname, '../props'),
      },
      {
        find: '@utils',
        replacement: path.resolve(__dirname, '../utils'),
      },
    ],
  },
  test: {
    coverage: {
      thresholds: { branches: 75, functions: 82, lines: 81, statements: 81 },
      exclude: ['**/*.d.ts', '**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
      include: ['**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['**/*.spec.ts', '**/*.test.ts', '**/__tests__/**/*.ts'],
    testTimeout: 10000,
  },
});
