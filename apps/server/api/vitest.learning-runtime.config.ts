import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
  ...base,
  resolve: base.resolve,
  test: {
    ...base.test,
    name: '@genfeedai/learning-runtime',
    pool: 'forks',
    env: {
      NODE_ENV: 'test',
      GENFEED_CLOUD: 'true',
      NEXT_PUBLIC_GENFEED_CLOUD: 'true',
    },
    include: [
      'test/integration/content-learning/content-learning-runtime.integration.spec.ts',
      'test/integration/content-learning/content-learning-publication-races.integration.spec.ts',
    ],
    exclude: [],
    setupFiles: [],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    hookTimeout: 180000,
    testTimeout: 60000,
  },
});
