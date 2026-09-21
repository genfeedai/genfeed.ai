import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@genfeedai/contracts': fileURLToPath(
        new URL('../../packages/contracts/src', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['*.test.ts'],
    name: 'scripts/typed-decisions',
  },
});
