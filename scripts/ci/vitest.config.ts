import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genfeedai/contracts': path.resolve(
        import.meta.dirname,
        '../../packages/contracts/src/index.ts',
      ),
    },
  },
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['*.test.ts'],
    name: 'scripts/ci',
  },
});
