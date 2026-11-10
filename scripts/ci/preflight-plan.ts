/**
 * Pure planning half of `bun run preflight` (scripts/ci/preflight.ts).
 *
 * Preflight runs, before a push, the checks that failed PR CI most often:
 * the Static Checks job, the Spec Typecheck ratchet and the executable
 * contracts. This module decides WHICH steps a diff needs. It performs no
 * git, turbo or filesystem I/O, so preflight-plan.test.ts drives it with
 * fixtures.
 *
 * `classifySpecTypecheckScope` is a port of the "Determine spec typecheck
 * scope" step in `.github/workflows/_ci-validation.yml` (bash `case` globs).
 * Keep the two in step: a path that escalates to every workspace in CI has to
 * escalate here too, or preflight passes a diff that CI then fails.
 */

export type PreflightStage =
  | 'contracts'
  | 'spec-typecheck'
  | 'static'
  | 'typecheck';

export const PREFLIGHT_STAGES: readonly PreflightStage[] = [
  'static',
  'typecheck',
  'spec-typecheck',
  'contracts',
];

export type PreflightStep = {
  /** Argv, run from the repository root. */
  command: readonly string[];
  env?: Readonly<Record<string, string>>;
  id: string;
  label: string;
  stage: PreflightStage;
};

export type SpecWorkspaceInventory = {
  /** Every workspace enrolled in the spec typecheck ratchet, in run order. */
  all: readonly string[];
  /** Enrolled workspaces under `apps/server` (shared server configs escalate). */
  serverWorkspaces: ReadonlySet<string>;
  /** Enrolled workspaces under `apps` (web, ...). */
  appWorkspaces: ReadonlySet<string>;
};

export type SpecTypecheckFileScope = {
  /** Apps (server or frontend) whose own files changed. */
  apps: string[];
  /** True when any `packages/**` file changed: turbo resolves the fan-out. */
  needsTurbo: boolean;
  reason: string;
  /** Every enrolled workspace when the diff reaches a shared surface. */
  workspaces: string[];
};

const SERVER_FILE_PATTERN = /^apps\/server\/([^/]+)\/.+$/u;
const APP_FILE_PATTERN = /^apps\/([^/]+)\/.+$/u;
const PACKAGE_FILE_PATTERN = /^packages\/[^/]+\/.+$/u;
const MARKDOWN_PATTERN = /\.md$/u;
const BIOME_FILE_PATTERN = /\.(?:js|jsx|ts|tsx|mjs|cjs|json|css)$/u;
const SECRETLINT_FILE_PATTERN =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|toml|sh|env.*)$/u;

export function selectBiomeFiles(files: readonly string[]): string[] {
  return files.filter((file) => BIOME_FILE_PATTERN.test(file));
}

export function selectSecretlintFiles(files: readonly string[]): string[] {
  return files.filter((file) => SECRETLINT_FILE_PATTERN.test(file));
}

/**
 * Classifies changed paths exactly as the workflow's `case` statement does.
 * `case` globs span `/`, so the order of the branches matters and is kept.
 */
export function classifySpecTypecheckScope(
  changedFiles: readonly string[],
  inventory: SpecWorkspaceInventory,
): SpecTypecheckFileScope {
  const apps = new Set<string>();
  let needsTurbo = false;
  const escalate = (reason: string): SpecTypecheckFileScope => ({
    apps: [],
    needsTurbo: false,
    reason,
    workspaces: [...inventory.all],
  });

  for (const file of changedFiles) {
    if (file.length === 0) continue;

    const serverMatch = SERVER_FILE_PATTERN.exec(file);
    if (serverMatch) {
      const workspace = serverMatch[1] ?? '';
      if (inventory.serverWorkspaces.has(workspace)) {
        apps.add(workspace);
        continue;
      }
      return escalate(`full: shared server surface ${file}`);
    }
    if (file.startsWith('apps/server/')) {
      return escalate(`full: shared server config ${file}`);
    }

    const appMatch = APP_FILE_PATTERN.exec(file);
    if (appMatch) {
      const workspace = appMatch[1] ?? '';
      // Not every app is enrolled: no spec config means "not part of this
      // guard", not "escalate".
      if (inventory.appWorkspaces.has(workspace)) apps.add(workspace);
      continue;
    }

    if (
      file.startsWith('docs/') ||
      file.startsWith('.agents/') ||
      MARKDOWN_PATTERN.test(file)
    ) {
      continue;
    }
    if (file.startsWith('apps/')) continue;

    if (PACKAGE_FILE_PATTERN.test(file)) {
      needsTurbo = true;
      continue;
    }

    return escalate(`full: shared surface ${file}`);
  }

  const scoped = inventory.all.filter((workspace) => apps.has(workspace));
  return {
    apps: scoped,
    needsTurbo,
    reason: needsTurbo
      ? 'packages touched, resolving affected packages via turbo'
      : 'affected only',
    workspaces: needsTurbo ? [] : scoped,
  };
}

export type PreflightPlanInput = {
  base: string;
  /** Files that exist after the change (added, changed, renamed, untracked). */
  changedFiles: readonly string[];
  /** Run `turbo lint --affected` too (workspace lint scripts, can rewrite files). */
  hasLint?: boolean;
  /** Whether a `gitleaks` binary is on PATH. */
  hasGitleaks: boolean;
  /** Packages to build before the spec ratchet; empty builds every package. */
  specBuildFilters: readonly string[];
  /** Resolved spec typecheck workspaces; empty skips the ratchet. */
  specWorkspaces: readonly string[];
  /** The Prisma schema or a migration changed. */
  touchesMigrations: boolean;
  /** Source files changed that the typecheck stage can see. */
  typecheckFilters: readonly string[];
};

const MIGRATION_PATH_PATTERN =
  /^packages\/prisma\/prisma\/(?:migrations\/|schema\.prisma$)/u;

export function touchesMigrationFiles(files: readonly string[]): boolean {
  return files.some((file) => MIGRATION_PATH_PATTERN.test(file));
}

export function planPreflight(input: PreflightPlanInput): PreflightStep[] {
  const steps: PreflightStep[] = [];
  const biomeFiles = selectBiomeFiles(input.changedFiles);
  const secretFiles = selectSecretlintFiles(input.changedFiles);

  steps.push(
    {
      command: [
        'bun',
        'run',
        'scripts/architecture/check-ratchet-growth.ts',
        '--base',
        input.base,
      ],
      id: 'ratchet-growth',
      label: 'Ratchet baselines did not grow',
      stage: 'static',
    },
    {
      command: ['node', 'scripts/ci/e2e-spec-impact.mjs', '--base', input.base],
      id: 'e2e-spec-impact',
      label: 'E2E specs follow UI changes',
      stage: 'static',
    },
    {
      command: ['bun', 'run', 'check:skills-catalog'],
      id: 'skills-catalog',
      label: 'Pinned product skill catalog',
      stage: 'static',
    },
    {
      command: ['bun', 'run', 'check:skill-trusted-builtin-allowlist'],
      id: 'skill-allowlist',
      label: 'Skill trusted-builtin allowlist',
      stage: 'static',
    },
    {
      command: ['bun', 'run', 'env:check'],
      id: 'env-check',
      label: 'Env files and .env.example drift',
      stage: 'static',
    },
  );

  if (biomeFiles.length > 0) {
    steps.push({
      command: [
        'bunx',
        'biome',
        'check',
        '--config-path=biome-staged.json',
        '--no-errors-on-unmatched',
        ...biomeFiles,
      ],
      id: 'biome',
      label: `Biome format and lint (${biomeFiles.length} changed files)`,
      stage: 'static',
    });
  }

  if (secretFiles.length > 0) {
    steps.push({
      command: ['bunx', 'secretlint', ...secretFiles],
      id: 'secretlint',
      label: `Secretlint (${secretFiles.length} changed files)`,
      stage: 'static',
    });
  }

  if (input.hasGitleaks) {
    steps.push({
      command: [
        'gitleaks',
        'git',
        '--config',
        '.gitleaks.toml',
        `--log-opts=${input.base}..HEAD`,
        '--redact',
        '--no-banner',
        '--exit-code',
        '1',
      ],
      id: 'gitleaks',
      label: 'Gitleaks over the branch commits',
      stage: 'static',
    });
  }

  if (input.touchesMigrations) {
    steps.push({
      command: [
        'node',
        'scripts/ci/migration-safety.mjs',
        '--base',
        input.base,
      ],
      id: 'migration-safety',
      label: 'Destructive migration release compatibility',
      stage: 'static',
    });
  }

  if (input.hasLint) {
    steps.push({
      command: [
        'bunx',
        'turbo',
        'run',
        'lint',
        '--affected',
        '--concurrency=1',
      ],
      env: { TURBO_SCM_BASE: input.base },
      id: 'lint',
      label: 'Workspace lint (affected)',
      stage: 'static',
    });
  }

  if (input.typecheckFilters.length > 0) {
    steps.push({
      command: [
        'bunx',
        'turbo',
        'run',
        'type-check',
        ...input.typecheckFilters,
        '--concurrency=2',
      ],
      id: 'typecheck',
      label: 'Typecheck (affected workspaces)',
      stage: 'typecheck',
    });
  }

  if (input.specWorkspaces.length > 0) {
    steps.push({
      command:
        input.specBuildFilters.length > 0
          ? [
              'bunx',
              'turbo',
              'run',
              'build',
              ...input.specBuildFilters,
              '--concurrency=2',
            ]
          : [
              'bunx',
              'turbo',
              'run',
              'build',
              '--filter=./packages/*',
              '--concurrency=2',
            ],
      id: 'spec-build',
      label: 'Build packages for spec typecheck',
      stage: 'spec-typecheck',
    });
    for (const workspace of input.specWorkspaces) {
      steps.push({
        command: [
          'bun',
          'run',
          'scripts/architecture/check-spec-typecheck.ts',
          '--workspace',
          workspace,
        ],
        id: `spec-typecheck:${workspace}`,
        label: `Spec typecheck ratchet: ${workspace}`,
        stage: 'spec-typecheck',
      });
    }
  }

  steps.push(
    {
      command: ['bun', 'run', '--cwd', 'packages/contracts', 'build'],
      id: 'contracts-build',
      label: 'Build contracts for executable imports',
      stage: 'contracts',
    },
    {
      command: ['bun', 'run', 'test:executable-contracts'],
      id: 'executable-contracts',
      label: 'Executable contracts',
      stage: 'contracts',
    },
  );

  return steps;
}
