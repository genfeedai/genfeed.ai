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
    // Repo-wide scan (no file args) — blocks raw HTML elements that bypass
    // @ui/primitives. Previously only gated staged files via lint-staged
    // (skippable with --no-verify / non-hook commits); this enforces it in CI.
    command: ['bash', 'scripts/lint-no-raw-html.sh'],
    name: 'Raw HTML elements',
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
