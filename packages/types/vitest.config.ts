import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/types': path.resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
