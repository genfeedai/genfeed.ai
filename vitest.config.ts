import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/mobile/app/vitest.config.ts',
      'apps/extensions/browser/app/vitest.config.ts',
      'apps/server/*/vitest.config.ts',
      'apps/server/api/vitest.config.e2e.ts',
      'apps/app/vitest.config.mts',
      'packages/*/vitest.config.ts',
      'packages/*/vitest.config.mts',
    ],
  },
});
