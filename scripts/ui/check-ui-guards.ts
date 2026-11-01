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
    // Progress bars and step circles come from Progress (size, tone) and
    // Stepper; hand-built fills, className restyles and indicatorClassName fail.
    command: ['bun', 'run', 'scripts/ui/hand-built/progress.ts'],
    name: 'Hand-built progress bars and steppers',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-no-story-files.ts'],
    name: 'No Storybook story files (Storybook is not installed)',
    required: true,
  },
  {
    // List pages search through SearchField (the Filters menu attached inside
    // it), never the raw Searchbar, so every subbar stays one design.
    command: ['bun', 'run', 'scripts/check-subbar-search.ts'],
    name: 'Subbar search (SearchField, Filters menu inside)',
    required: true,
  },
  {
    // Subbars take refresh in `refresh` and their controls through
    // SubbarControls, so every bar keeps one order.
    command: ['bun', 'run', 'scripts/check-subbar-slots.ts'],
    name: 'Subbar slots (refresh slot, SubbarControls order)',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-no-nested-cards.ts'],
    name: 'Nested card composition',
    required: true,
  },
  {
    // Blocks hand-built card surfaces and className restyles of the shared Card.
    // Baseline: scripts/ui/hand-built/cards.baseline.json (empty).
    command: ['bun', 'run', 'scripts/ui/hand-built/cards.ts'],
    name: 'Cards and panels (shared Card, no hand-built surfaces or restyles)',
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
    command: ['bun', 'run', 'scripts/check-composer-surface-styling.ts'],
    name: 'Composer surface styling (border/shadow/radius live in PROMPT_BAR_SURFACE_CLASS)',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-hardcoded-app-routes.ts'],
    name: 'Hardcoded app routes (nav sinks must use APP_ROUTES / route builders)',
    required: true,
  },
  {
    command: ['bun', 'run', 'scripts/check-route-params-guard.ts'],
    name: 'Route params (useRouteParams, never next/navigation useParams)',
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
