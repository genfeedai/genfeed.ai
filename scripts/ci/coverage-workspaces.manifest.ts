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
  'packages/constants',
  'packages/contexts',
  'packages/enums',
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

export const COVERAGE_ROOT_SCRIPTS = ['test:e2e:coverage'] as const;
