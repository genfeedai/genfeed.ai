import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.ts';

/**
 * Database load suite (`scripts/db-load`). Reuses the unit config's alias and
 * SWC (Nest decorator metadata) setup so the harness can import the real
 * controllers and services, but only picks up `*.loadtest.ts`, installs no mocks
 * and has no per-test timeout (a 1000x run takes minutes).
 */
export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    coverage: { enabled: false },
    // The harness measures the hosted (CLOUD) tenant guard, as production runs it.
    env: { ...unitConfig.test?.env, GENFEED_CLOUD: 'true' },
    exclude: ['**/node_modules/**', '**/dist/**'],
    hookTimeout: 0,
    include: ['scripts/db-load/**/*.loadtest.ts'],
    isolate: true,
    name: '@genfeedai/api-db-load',
    setupFiles: [],
    testTimeout: 0,
  },
});
