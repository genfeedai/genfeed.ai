import { spawnSync } from 'node:child_process';

const checks = [
  {
    command: ['bun', 'run', 'scripts/check-design-system-boundaries.ts'],
    name: 'Design-system boundaries',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-app-ui-boundaries.ts'],
    name: 'App UI boundaries',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-raw-ui-controls.ts'],
    name: 'Raw input/select controls',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-raw-button-usage.ts'],
    name: 'Raw button usage',
    required: false,
  },
  {
    command: ['bun', 'run', 'scripts/check-modal-standard-usage.ts'],
    name: 'Modal architecture',
    required: true,
  },
] as const;

let failed = false;
let advisoryFailed = false;

for (const check of checks) {
  const mode = check.required ? 'required' : 'advisory';
  console.log(`\nUI guard: ${check.name} (${mode})`);

  const [command, ...args] = check.command;
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0 && check.required) {
    failed = true;
    continue;
  }

  if (result.status !== 0) {
    advisoryFailed = true;
  }
}

if (failed) {
  process.exit(1);
}

if (advisoryFailed) {
  console.warn(
    '\nRequired UI guards passed. Advisory UI guards reported existing debt.',
  );
  process.exit(0);
}

console.log('\nUI guards passed.');
