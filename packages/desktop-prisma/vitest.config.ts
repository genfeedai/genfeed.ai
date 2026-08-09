import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // index.ts is a pure barrel over the generated Prisma client.
      exclude: ['src/index.ts'],
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
