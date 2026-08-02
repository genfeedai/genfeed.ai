import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/config/license-server': path.resolve(
        __dirname,
        '../../packages/config/src/license-server.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['*.spec.ts'],
  },
});
