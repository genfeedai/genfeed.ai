import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/contracts': path.resolve(__dirname, 'src/index.ts'),
      '@genfeedai/contracts/api-types': path.resolve(
        __dirname,
        'src/api-types',
      ),
      '@genfeedai/contracts/constants': path.resolve(
        __dirname,
        'src/constants',
      ),
      '@genfeedai/contracts/desktop': path.resolve(__dirname, 'src/desktop'),
      '@genfeedai/contracts/enums': path.resolve(__dirname, 'src/enums'),
      '@genfeedai/contracts/interfaces': path.resolve(
        __dirname,
        'src/interfaces',
      ),
      '@genfeedai/contracts/queue': path.resolve(__dirname, 'src/queue'),
      '@genfeedai/contracts/types': path.resolve(__dirname, 'src/types'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      '__tests__/**/*.test.ts',
      '__tests__/**/*.spec.ts',
    ],
    passWithNoTests: true,
    testTimeout: 10000,
  },
});
