export type CoverageWorkspaceExclusion = {
  path: string;
  reason: string;
  trackingIssue: number;
};

export const COVERAGE_WORKSPACES = [
  'apps/app',
  'apps/server/api',
  'packages/agent',
  'packages/client',
  'packages/config',
  'packages/contracts/src/constants',
  'packages/contexts',
  'packages/contracts/src/enums',
  'packages/helpers',
  'packages/hooks',
  'packages/integrations',
  'packages/models',
  'packages/serializers',
  'packages/services',
  'packages/ui',
  'packages/utils',
  'packages/workflows',
] as const;

export const COVERAGE_WORKSPACE_EXCLUSIONS: CoverageWorkspaceExclusion[] = [];

// Bun-runner surfaces stay out of this vitest inventory on purpose (#2687).
// Measure them with `bun run test:cov` in apps/desktop/app and
// apps/extensions/ide/app rather than migrating those suites to Vitest.

export const COVERAGE_ROOT_SCRIPTS = ['test:e2e:coverage'] as const;
