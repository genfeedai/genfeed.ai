import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.spec.tsx',
        '**/*.test.tsx',
        '**/__tests__/**',
      ],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: { branches: 95, functions: 98, lines: 98, statements: 98 },
    },
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
