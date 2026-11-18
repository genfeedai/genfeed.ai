/**
 * Spec typecheck: every `.spec.ts`, `.test.ts` and `.e2e-spec.ts` file must
 * typecheck (#2407, #5244, #10270).
 *
 * Workspace tsconfigs exclude spec files, so nothing else typechecks them. A
 * workspace opts in by adding a `tsconfig.typecheck.specs.json`: the shipping
 * compiler options with the spec excludes dropped. This module discovers those
 * workspaces and runs `bun check` (the TypeScript checker built into Bun, same
 * diagnostics as `tsc`, all CPU cores) on each config. The check passes on
 * zero errors. The ratchet baseline that once allowed known errors was emptied
 * by #7903, so the baseline and the compiler-API script that read it are gone.
 *
 * Packages must be built first (`bunx turbo run build --filter='./packages/*'`)
 * because the typecheck base config resolves `@genfeedai/contracts` to its
 * `dist` output.
 *
 * Usage:
 *   bun run check:spec-typecheck api web ui     # these workspaces
 *   bun run check:spec-typecheck                # every enrolled workspace
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Every root scanned for a `tsconfig.typecheck.specs.json`. `apps/server` and
 * `packages` hold many workspaces one directory deep; `apps` holds several
 * frontend and desktop apps, and only those with a spec tsconfig enroll.
 */
export const DEFAULT_WORKSPACE_ROOTS = [
  'apps/server',
  'apps',
  'packages',
] as const;

export const SPEC_TSCONFIG_NAME = 'tsconfig.typecheck.specs.json';

const WHITESPACE_RUN_PATTERN = /\s+/u;

const logger = {
  error: (message: string) => console.error(`[SpecTypecheck] ${message}`),
  log: (message: string) => console.log(`[SpecTypecheck] ${message}`),
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function resolveFromRoot(rootDir: string, target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(rootDir, target);
}

/** Workspaces under one root that opted in with a spec tsconfig, sorted. */
export function discoverSpecWorkspaces(
  rootDir: string,
  workspacesDir: string,
): string[] {
  const absoluteDir = resolveFromRoot(rootDir, workspacesDir);

  if (!existsSync(absoluteDir)) {
    return [];
  }

  return readdirSync(absoluteDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(absoluteDir, entry.name, SPEC_TSCONFIG_NAME)),
    )
    .map((entry) => entry.name)
    .sort(compareText);
}

/**
 * Every enrolled workspace across every root, mapped to the root that owns it.
 * Names must be unique across roots: scope inputs name a workspace by its
 * directory alone.
 */
export function discoverSpecWorkspacesAcrossRoots(
  rootDir: string,
  workspaceRoots: readonly string[],
): Map<string, string> {
  const workspaceRootByName = new Map<string, string>();

  for (const workspaceRoot of workspaceRoots) {
    for (const workspace of discoverSpecWorkspaces(rootDir, workspaceRoot)) {
      const existingRoot = workspaceRootByName.get(workspace);
      if (existingRoot !== undefined && existingRoot !== workspaceRoot) {
        throw new Error(
          `Workspace "${workspace}" is enrolled under both "${existingRoot}" and ` +
            `"${workspaceRoot}". Workspace names must be unique across every spec ` +
            'typecheck root.',
        );
      }
      workspaceRootByName.set(workspace, workspaceRoot);
    }
  }

  return workspaceRootByName;
}

export type SpecTypecheckOutcome = {
  output: string;
  passed: boolean;
  workspace: string;
};

function runBunCheck(
  configPath: string,
  rootDir: string,
): SpecTypecheckOutcome {
  const child = spawnSync('bun', ['check', '--no-script', '-p', configPath], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    output: `${child.stdout ?? ''}${child.stderr ?? ''}`.trimEnd(),
    passed: child.status === 0 && child.error === undefined,
    workspace: '',
  };
}

/**
 * Checks each workspace in its own `bun check` process. Every workspace runs
 * even after one fails, so one fix never costs a CI round trip per workspace.
 */
export function runSpecTypecheck(options: {
  rootDir: string;
  workspaces?: readonly string[];
}): SpecTypecheckOutcome[] {
  const { rootDir } = options;
  const rootByName = discoverSpecWorkspacesAcrossRoots(
    rootDir,
    DEFAULT_WORKSPACE_ROOTS,
  );
  const requested = options.workspaces?.length
    ? [...new Set(options.workspaces)]
    : [...rootByName.keys()];

  const missing = requested.filter((workspace) => !rootByName.has(workspace));
  if (missing.length > 0) {
    throw new Error(
      `No ${SPEC_TSCONFIG_NAME} under ${DEFAULT_WORKSPACE_ROOTS.join(', ')} for: ${missing.join(', ')}.`,
    );
  }

  return requested.map((workspace) => {
    const configPath = path.join(
      rootDir,
      rootByName.get(workspace) as string,
      workspace,
      SPEC_TSCONFIG_NAME,
    );
    return { ...runBunCheck(configPath, rootDir), workspace };
  });
}

function main(): void {
  const rootDir = process.cwd();
  const workspaces = process.argv
    .slice(2)
    .flatMap((argument) => argument.split(WHITESPACE_RUN_PATTERN))
    .filter(Boolean);
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  const outcomes = runSpecTypecheck({ rootDir, workspaces });
  for (const outcome of outcomes) {
    if (isGitHubActions)
      console.log(`::group::Spec typecheck: ${outcome.workspace}`);
    logger.log(`${outcome.passed ? 'passed' : 'FAILED'}: ${outcome.workspace}`);
    if (outcome.output) console.log(outcome.output);
    if (isGitHubActions) console.log('::endgroup::');
  }

  const failed = outcomes.filter((outcome) => !outcome.passed);
  if (failed.length === 0) {
    logger.log(`Spec typecheck passed across ${outcomes.length} workspace(s).`);
    return;
  }

  logger.error(
    `Spec typecheck failed in ${failed.length} of ${outcomes.length} workspace(s): ${failed.map((outcome) => outcome.workspace).join(' ')}`,
  );
  for (const outcome of failed) {
    console.log(`----- ${outcome.workspace} -----`);
    console.log(outcome.output);
  }
  process.exitCode = 1;
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
