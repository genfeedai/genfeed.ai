import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
