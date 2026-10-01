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
    // 2000 bootstrap replicates over 180–240 rows exceeds Vitest's 5s default
    // when the full packages graph shares a CI runner.
    testTimeout: 20_000,
  },
});
