#!/usr/bin/env node
// Prints the Vitest arguments that select one test shard's files, one per line.
//
// The Plan job resolves the changed graph once and hands every shard its own
// files through the job matrix (scripts/ci/pr-test-plan.mjs). A shard runs
// exactly those files. It selects for itself in two cases: the full tier, which
// runs the whole suite split by Vitest, and a change run whose plan carried no
// usable list, which falls back to resolving the changed graph in the shard as
// every shard did before #10273.
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHARD_PATTERN = /^[1-9]\d*$/u;
const LINE_BREAK_PATTERN = /\r?\n/u;

function isInside(directory, target) {
  const relative = path.relative(directory, target);
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
}

/**
 * @param {{
 *   base?: string,
 *   count?: string,
 *   fileExists?: (file: string) => boolean,
 *   files?: string,
 *   forceFull?: boolean,
 *   repositoryRoot?: string,
 *   shard: string,
 *   suiteRoot: string,
 *   total: string,
 * }} options
 * @returns {{ args: string[], mode: 'full' | 'files' | 'changed', problem?: string }}
 */
export function selectShardArguments({
  base = '',
  count = '',
  fileExists = existsSync,
  files = '',
  forceFull = false,
  repositoryRoot = REPOSITORY_ROOT,
  shard,
  suiteRoot,
  total,
}) {
  if (!SHARD_PATTERN.test(shard) || !SHARD_PATTERN.test(total)) {
    throw new Error('SHARD and SHARD_TOTAL must be positive integers');
  }
  if (Number(shard) > Number(total)) {
    throw new Error('SHARD must not exceed SHARD_TOTAL');
  }
  if (!suiteRoot) throw new Error('SHARD_ROOT is required');

  const vitestShard = `--shard=${shard}/${total}`;
  if (forceFull || !base) return { args: [vitestShard], mode: 'full' };

  const changed = (problem) => ({
    args: ['--passWithNoTests', '--changed', base, vitestShard],
    mode: 'changed',
    problem,
  });

  const listed = files.split(LINE_BREAK_PATTERN).filter(Boolean);
  if (listed.length === 0) return changed('the plan listed no files');
  if (String(listed.length) !== count) {
    return changed(
      `the plan counted ${count || 'no'} files and the list holds ${listed.length}`,
    );
  }

  const suiteDirectory = path.resolve(repositoryRoot, suiteRoot);
  const resolved = [];
  for (const file of listed) {
    const absolute = path.resolve(suiteDirectory, file);
    if (!isInside(repositoryRoot, absolute)) {
      return changed(`${file} is outside the repository`);
    }
    if (!fileExists(absolute)) {
      return changed(`${file} is not in this checkout`);
    }
    resolved.push(absolute);
  }
  return { args: resolved, mode: 'files' };
}

function runCli(env = process.env) {
  const selection = selectShardArguments({
    base: env.CI_BASE_SHA,
    count: env.SHARD_FILE_COUNT,
    files: env.SHARD_FILES,
    forceFull: env.FORCE_FULL === 'true',
    shard: env.SHARD ?? '',
    suiteRoot: env.SHARD_ROOT ?? '',
    total: env.SHARD_TOTAL ?? '',
  });

  if (selection.mode === 'files') {
    process.stderr.write(
      `Running the ${selection.args.length} test files the plan gave this shard\n`,
    );
  } else if (selection.mode === 'changed') {
    process.stderr.write(
      `::warning::Shard file list not used (${selection.problem}); resolving the changed graph in the shard instead\n`,
    );
  } else {
    process.stderr.write('Running the whole suite, split by Vitest\n');
  }
  process.stdout.write(`${selection.args.join('\n')}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
