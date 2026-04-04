import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@constants': path.resolve(__dirname, '../ui/constants'),
      '@genfeedai/constants': path.resolve(
        __dirname,
        '../constants/dist/index.js',
      ),
      '@genfeedai/enums': path.resolve(__dirname, '../enums/dist/index.js'),
      '@genfeedai/helpers': path.resolve(__dirname, './src/index.ts'),
      '@helpers': path.resolve(__dirname, './src'),
      '@hooks': path.resolve(__dirname, '../hooks'),
      '@props': path.resolve(__dirname, '../props'),
      '@ui': path.resolve(__dirname, '../ui'),
      '@utils': path.resolve(__dirname, '../utils'),
    },
  },
  test: {
    coverage: {
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 80,
        statements: 80,
      },
    },
    environment: 'jsdom',
    globals: true,
    include: [
      '__tests__/**/*.ts',
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
    ],
    testTimeout: 10000,
  },
});
