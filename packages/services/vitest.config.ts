import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(__dirname, '../..');

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
        find: '@ui-constants',
        replacement: path.resolve(root, 'packages/ui/constants'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(root, 'packages/helpers/src'),
      },
      {
        find: '@models',
        replacement: path.resolve(root, 'packages/models'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname),
      },
      {
        find: '@utils',
        replacement: path.resolve(root, 'packages/utils'),
      },
    ],
  },
  test: {
    coverage: {
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
