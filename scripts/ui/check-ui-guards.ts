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
    // Single canonical raw-control scanner. Covers what three overlapping
    // scanners used to (raw HTML primitives, dead wrapper imports, raw
    // input/select + legacy form imports, raw buttons + button-styled anchors)
    // under one allowlist. Repo-wide when invoked without file args. Reports
    // categories separately and exits non-zero only on required violations,
    // so the former advisory button/anchor rules stay advisory here.
    command: ['bun', 'run', 'scripts/ui/control-guard.ts'],
    name: 'Raw UI controls (buttons, inputs, selects, primitives, wrapper imports)',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-no-nested-cards.ts'],
    name: 'Nested card composition',
    required: true,
  },
  {
    // Repo-wide scan (no file args) — blocks hand-rolled card surfaces that
    // bypass the shared Card. Baseline lives in the script's allowlist so this
    // is green on master; new violations fail. Also runs in pre-commit via
    // lint-staged.
    command: ['bash', 'scripts/lint-no-bespoke-card.sh'],
    name: 'Bespoke card surfaces',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-modal-standard-usage.ts'],
    name: 'Modal architecture',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-org-scoped-navigation.ts'],
    name: 'Org-scoped navigation (no bare router.push/replace in [orgSlug] tree)',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-hardcoded-app-routes.ts'],
    name: 'Hardcoded app routes (nav sinks must use APP_ROUTES / route builders)',
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
