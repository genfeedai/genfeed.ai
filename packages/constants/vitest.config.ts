import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/enums': path.resolve(__dirname, '../enums/src'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: true,
  },
});
