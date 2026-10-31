import { defineConfig } from 'vitest/config';

process.env.TZ ??= 'UTC';

const testProjects = [
  'apps/mobile/vitest.config.ts',
  'apps/extension/vitest.config.ts',
  'apps/server/*/vitest.config.ts',
  'apps/server/api/vitest.config.e2e.ts',
  'apps/vitest.config.mts',
  'packages/*/vitest.config.ts',
  'packages/*/vitest.config.mts',
  'scripts/vitest.config.ts',
  'scripts/*/vitest.config.ts',
];

export default defineConfig({
  test: {
    projects: testProjects,
  },
});
