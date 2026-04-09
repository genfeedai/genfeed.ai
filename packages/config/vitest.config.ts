import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@config': path.resolve(__dirname, './src'),
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
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      '__tests__/**/*.spec.ts',
      '__tests__/**/*.test.ts',
    ],
    passWithNoTests: true,
  },
});
