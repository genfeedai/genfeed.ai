/**
 * `bun run preflight`: run, before you push, what PR CI would run on this diff.
 *
 * It mirrors three CI jobs for the files changed since the trunk:
 *   - Static Checks (ratchet growth, e2e spec impact, skills, env drift, Biome,
 *     secretlint, gitleaks when installed, migration safety)
 *   - Typecheck for the affected workspaces
 *   - Spec Typecheck Ratchet for the affected workspaces
 *   - the executable contracts (`bun run test:executable-contracts`)
 * Planning lives in preflight-plan.ts; this file does the git, turbo and
 * process work.
 *
 * Works in a cloud container: it needs only `bun install` and the Prisma
 * client (`cd packages/prisma && bunx prisma generate`). It never runs a
 * per-package `tsc` by hand, because that shows false missing-module errors
 * until the workspace packages are built; the spec stage builds them first,
 * as CI does.
 *
 * Usage:
 *   bun run preflight                 # everything the diff needs
 *   bun run preflight --list          # print the plan, run nothing
 *   bun run preflight --only static,contracts
 *   bun run preflight --skip contracts
 *   bun run preflight --serial        # one lane at a time (default: typecheck + spec ratchet overlap the contracts)
 *   bun run preflight --keep-going    # run every step even after one fails (default: stop at the first failure)
 *   bun run preflight --full          # spec typecheck every workspace
 *   bun run preflight --lint          # also `turbo lint --affected` (may rewrite files)
 *   bun run preflight --base <ref>    # default: merge-base with origin/master
 *   bun run preflight --no-fetch      # do not refresh origin/master first
 *
 * The contracts stage runs under the Node pinned in `.node-version`, downloaded
 * once into ~/.cache/genfeed-preflight when the host Node differs.
 */

import {
  type ChildProcess,
  type SpawnOptions,
  spawn,
  spawnSync,
} from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WORKSPACE_ROOTS,
  discoverSpecWorkspacesAcrossRoots,
} from '../architecture/check-spec-typecheck';
import { ensurePinnedNode } from './preflight-node';
import {
  classifySpecTypecheckScope,
  PREFLIGHT_STAGES,
  type PreflightStage,
  type PreflightStep,
  planPreflight,
  type SpecWorkspaceInventory,
  touchesMigrationFiles,
} from './preflight-plan';
import {
  queryTurboAffectedScope,
  resolveSpecTypecheckScope,
} from './spec-typecheck-scope';
import { queryTypecheckScope } from './typecheck-affected-scope';

const GIT_MAX_BUFFER = 256 * 1024 * 1024;

const logger = {
  error: (message: string) => console.error(`[preflight] ${message}`),
  log: (message: string) => console.log(`[preflight] ${message}`),
};

export type PreflightOptions = {
  base: string | null;
  bail: boolean;
  full: boolean;
  hasFetch: boolean;
  hasLint: boolean;
  isListOnly: boolean;
  isParallel: boolean;
  only: ReadonlySet<PreflightStage> | null;
  skip: ReadonlySet<PreflightStage>;
};

function parseStages(
  value: string | undefined,
  flag: string,
): Set<PreflightStage> {
  const stages = new Set<PreflightStage>();
  for (const name of (value ?? '').split(',').filter(Boolean)) {
    const stage = PREFLIGHT_STAGES.find((candidate) => candidate === name);
    if (!stage) {
      throw new Error(
        `${flag}: unknown stage "${name}". Stages: ${PREFLIGHT_STAGES.join(', ')}.`,
      );
    }
    stages.add(stage);
  }
  return stages;
}

export function parseOptions(argv: readonly string[]): PreflightOptions {
  const options: PreflightOptions = {
    base: null,
    bail: true,
    full: false,
    hasFetch: true,
    hasLint: false,
    isListOnly: false,
    isParallel: true,
    only: null,
    skip: new Set(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--base':
        options.base = argv[++index] ?? null;
        if (!options.base) throw new Error('--base needs a ref or commit SHA.');
        break;
      case '--keep-going':
        options.bail = false;
        break;
      case '--full':
        options.full = true;
        break;
      case '--lint':
        options.hasLint = true;
        break;
      case '--list':
        options.isListOnly = true;
        break;
      case '--no-fetch':
        options.hasFetch = false;
        break;
      case '--only':
        options.only = parseStages(argv[++index], '--only');
        break;
      case '--serial':
        options.isParallel = false;
        break;
      case '--skip':
        options.skip = parseStages(argv[++index], '--skip');
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function git(args: readonly string[]): string {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${result.stderr?.trim() || `exit ${result.status}`}`,
    );
  }
  return result.stdout;
}

function lines(output: string): string[] {
  return output.split('\n').filter(Boolean);
}

function resolveBase(options: PreflightOptions): string {
  if (options.base) {
    return git(['rev-parse', '--verify', `${options.base}^{commit}`]).trim();
  }
  if (options.hasFetch) {
    // A stale origin/master widens the diff to every commit merged since, which
    // escalates the scope exactly as a stale base did in CI (2026-09-27).
    const fetched = spawnSync('git', ['fetch', 'origin', 'master', '--quiet'], {
      stdio: 'inherit',
    });
    if (fetched.status !== 0) {
      logger.log(
        'Could not fetch origin/master; using the local ref. Pass --no-fetch to silence this.',
      );
    }
  }
  try {
    return git(['merge-base', 'HEAD', 'origin/master']).trim();
  } catch {
    throw new Error(
      "origin/master not found. Run 'git fetch origin master' or pass --base <ref>.",
    );
  }
}

/** Everything that differs from the base: commits, staged, unstaged, untracked. */
function readChangedFiles(base: string): {
  existing: string[];
  touched: string[];
} {
  const tracked = lines(git(['diff', '--name-only', '--no-renames', base]));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard']));
  const touched = [...new Set([...tracked, ...untracked])].sort();
  return { existing: touched.filter((file) => existsSync(file)), touched };
}

function readInventory(rootDir: string): SpecWorkspaceInventory {
  const rootByName = discoverSpecWorkspacesAcrossRoots(
    rootDir,
    DEFAULT_WORKSPACE_ROOTS,
  );
  const all: string[] = [];
  const serverWorkspaces = new Set<string>();
  const appWorkspaces = new Set<string>();
  for (const [name, root] of rootByName) {
    all.push(name);
    if (root === 'apps/server') serverWorkspaces.add(name);
    if (root === 'apps') appWorkspaces.add(name);
  }
  return { all, appWorkspaces, serverWorkspaces };
}

function hasBinary(name: string): boolean {
  return spawnSync('which', [name], { stdio: 'ignore' }).status === 0;
}

type SpecScope = { buildFilters: string[]; workspaces: string[] };

function resolveSpecScope(
  rootDir: string,
  base: string,
  touched: readonly string[],
  options: PreflightOptions,
): SpecScope {
  const inventory = readInventory(rootDir);
  if (options.full) {
    return { buildFilters: [], workspaces: [...inventory.all] };
  }

  const fileScope = classifySpecTypecheckScope(touched, inventory);
  logger.log(`Spec typecheck scope: ${fileScope.reason}`);
  if (!fileScope.needsTurbo) {
    // An escalation builds every package; a narrow scope builds only what the
    // enrolled workspaces under test need, which is also every package for apps.
    return { buildFilters: [], workspaces: fileScope.workspaces };
  }

  const turbo = queryTurboAffectedScope(rootDir, base);
  const resolved = resolveSpecTypecheckScope({
    affectedPackagesOnly: turbo.affectedPackagesOnly,
    allAffectedNames: turbo.allAffectedNames,
    allWorkspaces: inventory.all,
    appsAffectedFromFiles: fileScope.apps,
    appWorkspaces: [...inventory.appWorkspaces, ...inventory.serverWorkspaces],
  });
  return {
    buildFilters: resolved.buildFilters,
    workspaces: resolved.workspaces,
  };
}

function resolveTypecheckFilters(rootDir: string, base: string): string[] {
  const scope = queryTypecheckScope(rootDir, base, undefined, {
    includeWorkingTree: true,
  });
  return scope.workspaces.map((workspace) => `--filter=${workspace}`);
}

type StepResult = {
  durationMs: number;
  id: string;
  label: string;
  status: 'failed' | 'passed' | 'skipped';
};

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
    : `${seconds}s`;
}

const activeChildren = new Set<ChildProcess>();
let isAborted = false;

/** Stops every running step; used by the default fail-fast mode. */
function abortRunningSteps(): void {
  isAborted = true;
  for (const child of activeChildren) {
    if (child.pid) {
      try {
        // Each step leads its own process group, so descendants stop too.
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already exited.
      }
    }
  }
}

/** PATH override that puts the pinned Node first; set once in `main`. */
let nodeEnv: Record<string, string> = {};

function runStep(
  step: PreflightStep,
  isCaptured: boolean,
): Promise<{ output: string; status: number }> {
  return new Promise((resolve) => {
    const [command, ...args] = step.command;
    const spawnOptions: SpawnOptions = {
      env: { ...process.env, ...step.env, ...nodeEnv },
      detached: true,
      stdio: isCaptured ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    };
    const child = spawn(command ?? '', args, spawnOptions);
    activeChildren.add(child);
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ output: `${output}${error.message}\n`, status: 127 });
    });
    child.on('close', (code) => {
      activeChildren.delete(child);
      resolve({ output, status: code ?? 1 });
    });
  });
}

/** Steps whose success is a precondition for another step. */
const PREREQUISITES: Readonly<Record<string, string>> = {
  'executable-contracts': 'contracts-build',
};

function prerequisiteFor(step: PreflightStep): string | null {
  if (step.id.startsWith('spec-typecheck:')) return 'spec-build';
  return PREREQUISITES[step.id] ?? null;
}

async function runSteps(
  steps: readonly PreflightStep[],
  options: PreflightOptions,
  isCaptured: boolean,
  results: StepResult[],
): Promise<void> {
  const failed = new Set<string>();
  for (const step of steps) {
    const needs = prerequisiteFor(step);
    if (needs && failed.has(needs)) {
      failed.add(step.id);
      results.push({
        durationMs: 0,
        id: step.id,
        label: step.label,
        status: 'skipped',
      });
      continue;
    }
    if (isAborted) {
      results.push({
        durationMs: 0,
        id: step.id,
        label: step.label,
        status: 'skipped',
      });
      continue;
    }

    if (!isCaptured) logger.log(`▶ ${step.label}`);
    const started = Date.now();
    const { output, status } = await runStep(step, isCaptured);
    const durationMs = Date.now() - started;
    if (isAborted && status !== 0) {
      // Stopped because another lane failed first.
      results.push({
        durationMs,
        id: step.id,
        label: step.label,
        status: 'skipped',
      });
      continue;
    }
    if (isCaptured && status !== 0) {
      logger.log(`▶ ${step.label}`);
      process.stdout.write(output);
    }
    if (status !== 0) {
      failed.add(step.id);
      if (options.bail) abortRunningSteps();
    }
    results.push({
      durationMs,
      id: step.id,
      label: step.label,
      status: status === 0 ? 'passed' : 'failed',
    });
    logger.log(
      `${status === 0 ? '✓' : '✗'} ${step.label} (${formatDuration(durationMs)})`,
    );
  }
}

function stagesToRun(options: PreflightOptions): PreflightStage[] {
  return PREFLIGHT_STAGES.filter(
    (stage) =>
      (options.only === null || options.only.has(stage)) &&
      !options.skip.has(stage),
  );
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  const rootDir = git(['rev-parse', '--show-toplevel']).trim();
  process.chdir(rootDir);

  const started = Date.now();
  const base = resolveBase(options);
  const { existing, touched } = readChangedFiles(base);
  if (touched.length === 0) {
    logger.log(`Nothing changed since ${base.slice(0, 9)}. Nothing to check.`);
    return 0;
  }
  logger.log(
    `${touched.length} file(s) changed since ${base.slice(0, 9)}${
      git(['status', '--porcelain']).trim()
        ? ' (including uncommitted work)'
        : ''
    }.`,
  );

  const stages = stagesToRun(options);
  if (!options.isListOnly && stages.includes('contracts')) {
    const pinned = ensurePinnedNode(rootDir);
    logger.log(pinned.note);
    if (pinned.binDir) {
      nodeEnv = {
        PATH: `${pinned.binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      };
    }
  }
  const specScope = stages.includes('spec-typecheck')
    ? resolveSpecScope(rootDir, base, touched, options)
    : { buildFilters: [], workspaces: [] };
  const typecheckFilters = stages.includes('typecheck')
    ? resolveTypecheckFilters(rootDir, base)
    : [];

  const plan = planPreflight({
    base,
    changedFiles: existing,
    hasGitleaks: hasBinary('gitleaks'),
    hasLint: options.hasLint,
    specBuildFilters: specScope.buildFilters,
    specWorkspaces: specScope.workspaces,
    touchesMigrations: touchesMigrationFiles(touched),
    typecheckFilters,
  }).filter((step) => stages.includes(step.stage));

  if (options.isListOnly) {
    for (const step of plan) {
      console.log(
        `${step.stage}\t${step.id}\t${step.command.slice(0, 12).join(' ')}`,
      );
    }
    return 0;
  }

  const results: StepResult[] = [];
  const byStage = (stage: PreflightStage) =>
    plan.filter((step) => step.stage === stage);

  await runSteps(byStage('static'), options, false, results);

  // Two lanes so the slow contracts overlap the compiler work without the
  // memory of three heavy stages at once (that got a container OOM-killed).
  const compilerLane = [...byStage('typecheck'), ...byStage('spec-typecheck')];
  const contractsLane = byStage('contracts');
  if (options.isParallel) {
    await Promise.all([
      runSteps(compilerLane, options, true, results),
      runSteps(contractsLane, options, true, results),
    ]);
  } else {
    await runSteps(compilerLane, options, false, results);
    await runSteps(contractsLane, options, false, results);
  }

  const failures = results.filter((result) => result.status === 'failed');
  const skipped = results.filter((result) => result.status === 'skipped');
  console.log('');
  for (const result of results) {
    const mark =
      result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '-';
    console.log(
      `  ${mark} ${result.label}${result.status === 'skipped' ? ' (skipped)' : ` (${formatDuration(result.durationMs)})`}`,
    );
  }
  console.log('');
  logger.log(
    `${failures.length === 0 ? 'Passed' : `FAILED ${failures.length} step(s)`}, ${skipped.length} skipped, in ${formatDuration(Date.now() - started)}.`,
  );
  if (failures.length > 0) {
    logger.log(
      `Re-run one stage: bun run preflight --only ${[
        ...new Set(
          failures.map(
            (failure) =>
              plan.find((step) => step.id === failure.id)?.stage ?? 'static',
          ),
        ),
      ].join(',')}`,
    );
  }
  return failures.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
