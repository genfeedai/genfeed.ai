import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // index.ts + contracts/index.ts are pure barrels; types.ts is type-only.
      exclude: ['src/contracts/**', 'src/index.ts', 'src/types.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    passWithNoTests: true,
  },
});
