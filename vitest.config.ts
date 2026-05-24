import { defineConfig } from 'vitest/config';

process.env.TZ ??= 'UTC';

const testProjects = [
  'apps/mobile/app/vitest.config.ts',
  'apps/extensions/browser/app/vitest.config.ts',
  'apps/server/*/vitest.config.ts',
  'apps/server/api/vitest.config.e2e.ts',
  'apps/vitest.config.mts',
  'packages/*/vitest.config.ts',
  'packages/*/vitest.config.mts',
];

export default defineConfig({
  test: {
    projects: testProjects,
  },
});
