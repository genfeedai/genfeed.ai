import { spawnSync } from 'node:child_process';

const checks = [
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-typescript-toolchain.ts',
    ],
    name: 'TypeScript 7 compiler boundary',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-no-api-bullmq-processors.ts',
    ],
    name: 'API BullMQ processor boundary',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-bull-board-queue-parity.ts',
    ],
    name: 'Bull Board queue parity',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-no-workspace-tasks-shadow.ts',
    ],
    name: 'Retired workspace-tasks shadow',
  },
  {
    command: ['bun', 'run', 'scripts/architecture/check-portless-contract.ts'],
    name: 'Portless local-development contract',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-deployment-mode-boundary.ts',
    ],
    name: 'Deployment mode boundary',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-config-package-boundary.ts',
    ],
    name: 'Config package license-state boundary',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-marketplace-boundary.ts',
    ],
    name: 'Marketplace public-boundary',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-deterministic-locale.ts',
    ],
    name: 'Deterministic locale boundary',
  },
  {
    command: ['bun', 'run', 'scripts/check-decorator-boundaries.ts'],
    name: 'Nest decorator boundaries',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-deleted-audit-orphans.ts',
    ],
    name: 'Deleted audit orphans (#2665)',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-legacy-cron-jobs-surface.ts',
    ],
    name: 'Legacy cron-jobs product surface',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-platform-cron-boundary.ts',
    ],
    name: 'Platform cron boundary',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-product-workflow-boundary.ts',
    ],
    name: 'Product workflow boundary',
  },
  {
    command: ['bun', 'run', 'scripts/architecture/check-route-shadowing.ts'],
    name: 'Controller route shadowing',
  },
  {
    command: ['bun', 'run', 'scripts/architecture/check-cross-org-unsafe.ts'],
    name: 'Cross-org unsafe hatch ratchet',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-agent-decomposition-size.ts',
    ],
    name: 'Agent decomposition size ratchet',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-agent-tool-dispatch.ts',
    ],
    name: 'Agent tool dispatch coverage',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-github-action-versions.ts',
    ],
    name: 'GitHub Action version consistency',
  },
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-project-reference-deps.ts',
    ],
    name: 'Project reference dependency parity',
  },
] as const;

let failed = false;

for (const check of checks) {
  console.log(`\nArchitecture guard: ${check.name}`);

  const [command, ...args] = check.command;
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nArchitecture guards passed.');
