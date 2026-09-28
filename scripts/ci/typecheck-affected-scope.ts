/**
 * Alias-aware `type-check` selection for pull requests.
 *
 * `turbo run type-check --affected` selects by the package.json dependency
 * graph. Workspaces that compile a sibling's sources through tsconfig `paths`
 * hash those sources as `$TURBO_ROOT$/...` type-check inputs instead (see
 * scripts/architecture/check-typecheck-alias-inputs.ts), so a PR touching
 * only `packages/agent/src` never selected `packages/props`, whose hash it
 * changes. This script returns turbo's own affected set plus every workspace
 * whose type-check task graph hashes a changed file.
 *
 * Turbo's `futureFlags.affectedUsingTaskInputs` does the same repo-wide, but
 * it also re-scopes lint/test/build selection, `turbo query` and `turbo
 * prune`, and drops `apps/app#build` (whose `dependsOn` has no `^build`) from
 * the spec-typecheck scope query. This keeps the change to one task.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  createTaskGraph,
  discoverWorkspaces,
  isHashedBy,
} from '../architecture/check-typecheck-alias-inputs';

const logger = {
  log: (message: string) => console.error(`[TypecheckScope] ${message}`),
};

export type TypecheckScopeInput = {
  changedFiles: readonly string[];
  /** Workspace name → globs its `type-check` task graph hashes. */
  hashGlobsByWorkspace: ReadonlyMap<string, readonly string[]>;
  /** Packages `turbo run type-check --affected` selects. */
  turboAffected: readonly string[];
};

export type TypecheckScope = {
  /** Selected only through hashed inputs, not the package graph. */
  added: string[];
  workspaces: string[];
};

export function resolveTypecheckScope(
  input: TypecheckScopeInput,
): TypecheckScope {
  const selected = new Set(input.turboAffected);
  const added: string[] = [];

  for (const [workspace, globs] of input.hashGlobsByWorkspace) {
    if (
      !selected.has(workspace) &&
      input.changedFiles.some((file) => isHashedBy(file, globs))
    ) {
      selected.add(workspace);
      added.push(workspace);
    }
  }

  return { added: added.sort(), workspaces: [...selected].sort() };
}

export function readHashGlobsByWorkspace(
  rootDir: string,
): Map<string, string[]> {
  const workspaces = discoverWorkspaces(rootDir);
  const graph = createTaskGraph(rootDir, workspaces);

  return new Map(
    workspaces
      .filter((workspace) => workspace.manifest.scripts?.['type-check'])
      .map((workspace) => [
        workspace.name,
        graph.scope(workspace.dir, 'type-check').globs,
      ]),
  );
}

export function parseTurboTypecheckPackages(dryRunJson: string): string[] {
  const parsed = JSON.parse(dryRunJson) as {
    tasks?: { package?: string; task?: string }[];
  };
  if (!Array.isArray(parsed.tasks)) {
    throw new TypeError('Turbo dry-run output must contain a tasks array');
  }

  return [
    ...new Set(
      parsed.tasks
        .filter((task) => task.task === 'type-check' && task.package)
        .map((task) => task.package ?? ''),
    ),
  ].sort();
}

/** The subset of `spawnSync`'s return shape this module reads. */
export type ProcessResult = {
  error?: Error;
  status: number | null;
  stderr?: string;
  stdout: string;
};

export type RunProcess = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => ProcessResult;

const runProcess: RunProcess = (command, args, options) =>
  spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: 64 * 1024 * 1024,
  });

function run(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
  runner: RunProcess,
): string {
  const result = runner(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${
        result.stderr?.trim() || `exit ${result.status ?? 'unknown'}`
      }`,
    );
  }
  return result.stdout;
}

export function queryTypecheckScope(
  rootDir: string,
  baseSha: string,
  runner: RunProcess = runProcess,
): TypecheckScope {
  const options = { cwd: rootDir, env: process.env };
  // Both sides of a rename: a deleted alias target changes its consumer too.
  const changedFiles = run(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', baseSha, 'HEAD'],
    options,
    runner,
  )
    .split('\0')
    .filter(Boolean);
  const turboAffected = parseTurboTypecheckPackages(
    run(
      'bunx',
      ['turbo', 'run', 'type-check', '--affected', '--dry=json'],
      { cwd: rootDir, env: { ...process.env, TURBO_SCM_BASE: baseSha } },
      runner,
    ),
  );

  return resolveTypecheckScope({
    changedFiles,
    hashGlobsByWorkspace: readHashGlobsByWorkspace(rootDir),
    turboAffected,
  });
}

if (import.meta.main) {
  const baseSha = process.env.CI_BASE_SHA;
  if (!baseSha) {
    throw new Error('CI_BASE_SHA is required');
  }

  const scope = queryTypecheckScope(path.resolve(process.cwd()), baseSha);
  logger.log(
    `Selected ${scope.workspaces.length} workspace(s); added through hashed inputs: ${
      scope.added.join(' ') || '<none>'
    }`,
  );
  // stdout carries only the turbo filter arguments.
  console.log(
    scope.workspaces.map((workspace) => `--filter=${workspace}`).join(' '),
  );
}
