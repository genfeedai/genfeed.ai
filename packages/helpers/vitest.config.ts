import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@constants',
        replacement: path.resolve(__dirname, '../ui/constants'),
      },
      {
        find: '@genfeedai/contracts/constants',
        replacement: path.resolve(__dirname, '../contracts/src/constants'),
      },
      {
        find: '@genfeedai/contracts/interfaces',
        replacement: path.resolve(
          __dirname,
          '../contracts/src/interfaces/index.ts',
        ),
      },
      {
        find: /^@genfeedai\/contracts$/,
        replacement: path.resolve(__dirname, '../contracts/src/index.ts'),
      },
      {
        find: '@genfeedai/helpers',
        replacement: path.resolve(__dirname, './src/index.ts'),
      },
      { find: '@helpers', replacement: path.resolve(__dirname, './src') },
      { find: '@hooks', replacement: path.resolve(__dirname, '../hooks') },
      { find: '@props', replacement: path.resolve(__dirname, '../props') },
      { find: '@ui', replacement: path.resolve(__dirname, '../ui') },
      { find: '@utils', replacement: path.resolve(__dirname, '../utils') },
    ],
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
      thresholds: { branches: 74, functions: 84, lines: 84, statements: 84 },
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
