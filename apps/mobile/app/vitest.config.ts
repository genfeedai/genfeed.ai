import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const mobileAppDir = path.dirname(fileURLToPath(import.meta.url));
const constantsDir = path.resolve(
  mobileAppDir,
  '../../../packages/contracts/src/constants',
);
const uiDir = path.resolve(mobileAppDir, '../../../packages/ui/src');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/constants$/,
        replacement: path.resolve(constantsDir, 'index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(constantsDir, '$1'),
      },
      {
        find: /^@genfeedai\/ui\/(.*)$/,
        replacement: path.resolve(uiDir, '$1'),
      },
      { find: /^@ui\/(.*)$/, replacement: path.resolve(uiDir, '$1') },
      { find: /^@\//, replacement: `${path.resolve(mobileAppDir, '.')}/` },
      { find: '@app', replacement: path.resolve(mobileAppDir, './app') },
      { find: '@hooks', replacement: path.resolve(mobileAppDir, './hooks') },
      {
        find: '@services',
        replacement: path.resolve(mobileAppDir, './services'),
      },
    ],
  },
  test: {
    coverage: {
      clean: true,
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '.expo/',
        'assets/',
      ],
      include: [
        'app/_layout.tsx',
        'app/index.tsx',
        'app/(protected)/_layout.tsx',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'services/**/*.{ts,tsx}',
      ],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 31, functions: 22, lines: 25, statements: 26 },
    },
    env: {
      NODE_ENV: 'test',
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**'],
    globals: true,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.{ts,tsx}', 'tests/**/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
  },
});
