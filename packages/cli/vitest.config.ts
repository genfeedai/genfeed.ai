import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
      '@serializers': path.resolve(__dirname, '../serializers/src'),
    },
  },
  test: {
    coverage: {
      exclude: [
        'src/index.ts',
        'src/commands/**/*.ts',
        'src/api/darkroom-api.ts',
        'src/middleware/**/*.ts',
        'src/scripts/**/*.ts',
        'src/utils/helpers.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 60,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    environment: 'node',
    exclude: ['tests/integration/**/*.test.ts'],
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
