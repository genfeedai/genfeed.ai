/**
 * Spec typecheck scope resolution for CI (#5315).
 *
 * The "Determine spec typecheck scope" step in `.github/workflows/ci.yml`
 * classifies changed files by path and, whenever any `packages/**` file
 * changed, hands off to this script's `main()` (invoked as the "Resolve
 * turbo-affected packages" step) to fold in turbo's own dependency graph.
 *
 * Turbo's `--affected` query answers "what did this diff affect", not
 * merely "what changed under packages/**": a package that fans out to a
 * dependent app must put that app in the ratchet's scope too, or the app's
 * spec typecheck silently runs against a stale package assumption (#5315).
 * Narrowing the turbo query itself with `--filter='./packages/*'` throws
 * that dependent-app edge away before this script ever sees it. So this
 * module queries the graph TWICE: once unfiltered (`allAffectedNames`) to
 * learn every affected workspace, apps included, and once narrowed to
 * `./packages/*` (`affectedPackagesOnly`) only to decide which packages the
 * "Build packages" step should target — that step never builds an app, only
 * the package dist output the ratchet's ts programs resolve.
 *
 * `resolveSpecTypecheckScope` is the pure merge of those two queries (plus
 * the file-based classifier's own app list) into exactly the
 * `workspaces` / `build_filters` / `run_any` GitHub Actions outputs the step
 * needs. It performs no turbo, git, or filesystem I/O, so
 * spec-typecheck-scope.test.ts exercises it directly with fixture inputs
 * instead of pattern-matching the workflow YAML.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WORKSPACE_ROOTS,
  discoverSpecWorkspacesAcrossRoots,
} from '../architecture/check-spec-typecheck';

const APP_WORKSPACE_ROOTS = new Set<string>(['apps/server', 'apps']);

const logger = {
  error: (message: string) => console.error(`[SpecTypecheckScope] ${message}`),
  log: (message: string) => console.log(`[SpecTypecheckScope] ${message}`),
};

export type SpecTypecheckScopeInput = {
  /** Every spec-typecheck-enrolled workspace name (apps and packages combined). */
  allWorkspaces: readonly string[];
  /** The subset of `allWorkspaces` that are apps rather than packages. */
  appWorkspaces: readonly string[];
  /** Apps whose OWN files changed, from the file-based classifier step. */
  appsAffectedFromFiles: readonly string[];
  /**
   * `bunx turbo run build --affected --filter='./packages/*' --dry=json`,
   * package names only, `@genfeedai/` stripped. Drives `buildFilters` only.
   */
  affectedPackagesOnly: readonly string[];
  /**
   * `bunx turbo run build --affected --dry=json` with NO filter — every
   * workspace turbo's graph found affected, apps included, `@genfeedai/`
   * stripped. Drives which apps enter `workspaces`.
   */
  allAffectedNames: readonly string[];
};

export type SpecTypecheckScopeResult = {
  buildFilters: string[];
  runAny: boolean;
  workspaces: string[];
};

/**
 * Merges the file-based and turbo-based affected sets into the final scope.
 *
 * An affected app's own package dependency footprint isn't something this
 * step derives cheaply (`apps/app` alone pulls in most of the monorepo per
 * #5244's baseline): if ANY enrolled app ends up in scope — whether from its
 * own changed files or only because it depends on a changed package — the
 * "Build packages" step falls back to building every package rather than
 * guessing which subset that app needs.
 */
export function resolveSpecTypecheckScope(
  input: SpecTypecheckScopeInput,
): SpecTypecheckScopeResult {
  const affected = new Set<string>([
    ...input.appsAffectedFromFiles,
    ...input.allAffectedNames,
  ]);

  const workspaces = input.allWorkspaces.filter((workspace) =>
    affected.has(workspace),
  );

  const appsInScope = input.appWorkspaces.some((workspace) =>
    affected.has(workspace),
  );

  const buildFilters = appsInScope
    ? []
    : input.affectedPackagesOnly.map((pkg) => `--filter=@genfeedai/${pkg}`);

  return {
    buildFilters,
    runAny: workspaces.length > 0,
    workspaces,
  };
}

function parseTurboAffectedNames(dryRunJson: string): string[] {
  const parsed = JSON.parse(dryRunJson) as { packages?: string[] };
  return (parsed.packages ?? []).map((name) =>
    name.replace(/^@genfeedai\//, ''),
  );
}

/** The subset of `spawnSync`'s return shape this module reads. */
export type TurboProcessResult = {
  error?: Error;
  status: number | null;
  stderr?: string;
  stdout: string;
};

/**
 * Injectable ONE LEVEL BELOW argument construction: it receives the exact
 * argv `runTurboAffectedDryRun` built (e.g. with or without a `--filter=...`
 * entry) and only runs the process. Stubbing here — instead of stubbing
 * `runTurboAffectedDryRun` itself — means spec-typecheck-scope.test.ts
 * exercises the REAL argument-construction logic below and can assert on
 * the argv it actually produced. A stub placed at `runTurboAffectedDryRun`'s
 * own level would miss a regression where the filter is hardcoded inside
 * that function's argv-building instead of passed in by the caller.
 */
export type RunTurboProcess = (
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => TurboProcessResult;

const runTurboProcess: RunTurboProcess = (args, options) =>
  spawnSync('bunx', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: 64 * 1024 * 1024,
  });

function runTurboAffectedDryRun(
  rootDir: string,
  baseSha: string,
  filter: string | undefined,
  runProcess: RunTurboProcess,
): string[] {
  const args = ['turbo', 'run', 'build', '--affected'];
  if (filter) {
    args.push(`--filter=${filter}`);
  }
  args.push('--dry=json');

  const result = runProcess(args, {
    cwd: rootDir,
    env: { ...process.env, TURBO_SCM_BASE: baseSha },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `turbo --affected --dry=json failed: ${
        result.stderr?.trim() || `exit ${result.status ?? 'unknown'}`
      }`,
    );
  }

  return parseTurboAffectedNames(result.stdout);
}

/**
 * Queries turbo's affected-workspace graph twice: once narrowed to
 * `./packages/*` (drives `affectedPackagesOnly`, used only for the "Build
 * packages" filter list) and once completely unfiltered (drives
 * `allAffectedNames`, apps included). Re-narrowing the SECOND call — whether
 * at this call site or inside `runTurboAffectedDryRun`'s own argv
 * construction — is the exact regression #5315 fixed: it throws away a
 * dependent app's edge before `resolveSpecTypecheckScope` ever sees it, so
 * the app's own spec typecheck silently runs against a stale package
 * assumption.
 *
 * `main()` always goes through this seam with the real `runTurboProcess`;
 * spec-typecheck-scope.test.ts injects a stub AT THE PROCESS LEVEL (see
 * `RunTurboProcess`) so the real argument-construction code above still
 * runs, and asserts on the exact argv each call produced.
 */
export function queryTurboAffectedScope(
  rootDir: string,
  baseSha: string,
  runProcess: RunTurboProcess = runTurboProcess,
): { affectedPackagesOnly: string[]; allAffectedNames: string[] } {
  const affectedPackagesOnly = runTurboAffectedDryRun(
    rootDir,
    baseSha,
    './packages/*',
    runProcess,
  );
  const allAffectedNames = runTurboAffectedDryRun(
    rootDir,
    baseSha,
    undefined,
    runProcess,
  );
  return { affectedPackagesOnly, allAffectedNames };
}

function discoverWorkspaceInventory(rootDir: string): {
  allWorkspaces: string[];
  appWorkspaces: string[];
} {
  const workspaceRootByName = discoverSpecWorkspacesAcrossRoots(
    rootDir,
    DEFAULT_WORKSPACE_ROOTS,
  );
  const allWorkspaces: string[] = [];
  const appWorkspaces: string[] = [];

  for (const [workspace, root] of workspaceRootByName) {
    allWorkspaces.push(workspace);
    if (APP_WORKSPACE_ROOTS.has(root)) {
      appWorkspaces.push(workspace);
    }
  }

  return { allWorkspaces, appWorkspaces };
}

function writeGithubOutput(result: SpecTypecheckScopeResult): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error('GITHUB_OUTPUT is required');
  }

  const outputs = {
    build_filters: result.buildFilters.join(' '),
    run_any: String(result.runAny),
    workspaces: result.workspaces.join(' '),
  };

  appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
}

function main(): void {
  const rootDir = path.resolve(process.cwd());
  const baseSha = process.env.CI_BASE_SHA;
  if (!baseSha) {
    throw new Error('CI_BASE_SHA is required');
  }

  const appsAffectedFromFiles = (process.env.APPS_AFFECTED ?? '')
    .split(/\s+/u)
    .filter((value) => value.length > 0);

  const { allWorkspaces, appWorkspaces } = discoverWorkspaceInventory(rootDir);
  const { affectedPackagesOnly, allAffectedNames } = queryTurboAffectedScope(
    rootDir,
    baseSha,
  );

  const result = resolveSpecTypecheckScope({
    affectedPackagesOnly,
    allAffectedNames,
    allWorkspaces,
    appsAffectedFromFiles,
    appWorkspaces,
  });

  writeGithubOutput(result);
  logger.log(
    `Spec typecheck scope (turbo-resolved): ${
      result.workspaces.join(' ') || '<none>'
    }`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exit(1);
  }
}
