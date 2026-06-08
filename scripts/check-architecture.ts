import { spawnSync } from 'node:child_process';

const checks = [
  {
    command: [
      'bun',
      'run',
      'scripts/architecture/check-no-api-bullmq-processors.ts',
    ],
    name: 'API BullMQ processor boundary',
  },
  {
    command: ['bun', 'run', 'scripts/check-decorator-boundaries.ts'],
    name: 'Nest decorator boundaries',
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
