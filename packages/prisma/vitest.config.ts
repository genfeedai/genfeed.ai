import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Schema/migration source-integrity guards (e.g. hot-path-indexes.test.ts)
    // live next to the Prisma schema, not under src/.
    include: ['prisma/**/*.test.ts'],
    passWithNoTests: true,
  },
});
