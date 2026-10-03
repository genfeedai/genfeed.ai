import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Cron specs share the default workers aliases so the two configs cannot drift.
export default defineConfig({
  ...base,
  resolve: base.resolve,
  test: {
    ...base.test,
    coverage: {
      exclude: [
        'src/crons/**/*.spec.ts',
        'src/crons/**/*.module.ts',
        'src/crons/**/index.ts',
      ],
      include: ['src/crons/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage-cron',
      // First floor for the cron-only config (#2687). Raise after a real
      // `bun run test:cron:cov` measurement; do not lower without an issue.
      thresholds: { branches: 20, functions: 25, lines: 25, statements: 25 },
    },
    exclude: ['**/node_modules/**', '**/.git/**'],
    include: ['src/crons/**/*.spec.ts'],
    passWithNoTests: false,
  },
});
