import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@eval-workflows': fileURLToPath(
        new URL('../../packages/workflows/src', import.meta.url),
      ),
      '@eval-actions': fileURLToPath(
        new URL('../../packages/actions/src', import.meta.url),
      ),
      '@eval-contracts': fileURLToPath(
        new URL('../../packages/contracts/src', import.meta.url),
      ),
      '@eval-agent': fileURLToPath(
        new URL('../../packages/agent/src', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['*.test.ts'],
    name: 'scripts/agent-eval',
  },
});
