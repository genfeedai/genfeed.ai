import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      thresholds: { branches: 98, functions: 98, lines: 98, statements: 98 },
      // index.ts is a pure barrel over the generated Prisma client.
      exclude: ['src/index.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
    globals: true,
    // Schema/migration source-integrity guards (e.g. hot-path-indexes.test.ts)
    // live next to the Prisma schema, not under src/.
    include: ['__tests__/**/*.test.ts', 'prisma/**/*.test.ts'],
    passWithNoTests: true,
  },
});
