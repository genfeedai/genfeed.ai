#!/usr/bin/env node
// One-command re-sign for the RUNTIME_ACCEPTANCE_OWNER_CONTRACT repo variable (#6073).
//
// The variable pins the sha256 and passing titles of the brand-receipt and
// storage acceptance specs so a PR cannot weaken them. After a legitimate spec
// edit the owner runs this script: it recomputes the pins at a commit, prints a
// readable diff (removed titles highlighted), validates the result with the
// release validators, and only after an explicit y/N sets the variable.
//
// Titles cannot be derived from source (it.each, $placeholders), so changed
// files need `--report <vitest-json>` from a passing run of those specs.
// Unchanged files keep their pinned titles. Nothing is ever invented.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BRAND_PATH,
  BRAND_SOURCE_CONTRACT,
  STORAGE_PATHS,
  validateBrandOwnerContract,
  validateOwnerContract,
} from '../ci/runtime-acceptance.mjs';

export const VARIABLE_NAME = 'RUNTIME_ACCEPTANCE_OWNER_CONTRACT';
export const DEFAULT_REPO = 'genfeedai/genfeed.ai';
export const DEFAULT_REF = 'origin/master';
const ACCEPTANCE_MODULE = 'scripts/ci/runtime-acceptance.mjs';
const HISTORY_LIMIT = 50;
const MAX_BLOB = 50 * 1024 * 1024;

export const CONTRACT_PATHS = [BRAND_PATH, ...STORAGE_PATHS];

export const sha256Hex = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

export function parseArguments(argv) {
  const options = {
    dryRun: false,
    ref: DEFAULT_REF,
    repo: DEFAULT_REPO,
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      index += 1;
      const next = argv[index];
      if (!next || next.startsWith('--'))
        throw new Error(`${arg} requires a value`);
      return next;
    };
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--sha') options.ref = value();
    else if (arg === '--repo') options.repo = value();
    else if (arg === '--report') options.report = value();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

// Passed titles per contract path from a vitest `--reporter=json` report.
export function titlesFromReport(report, paths = CONTRACT_PATHS) {
  if (!report || !Array.isArray(report.testResults))
    throw new Error('Report is not a vitest JSON report (no testResults).');
  const titles = new Map();
  for (const file of report.testResults) {
    const name = String(file.name ?? '').replaceAll('\\', '/');
    const match = paths.find((entry) => name.endsWith(`/${entry}`));
    if (!match) continue;
    const passed = [];
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== 'passed')
        throw new Error(
          `Report has a ${assertion.status} test in ${match}: ${assertion.fullName}`,
        );
      passed.push(assertion.fullName);
    }
    if (titles.has(match)) throw new Error(`Report repeats ${match}`);
    titles.set(match, passed);
  }
  return titles;
}

// Next contract: changed files take titles from the report, unchanged files keep
// their pinned titles. `missing` lists changed files with no titles available.
export function buildNextContract({ current, hashes, titlesByPath }) {
  const currentEntries = new Map(
    current
      ? [current.brand, ...(current.storage ?? [])].map((entry) => [
          entry.path,
          entry,
        ])
      : [],
  );
  const missing = [];
  const entryFor = (entryPath) => {
    const previous = currentEntries.get(entryPath);
    const sha256 = hashes.get(entryPath);
    const reported = titlesByPath.get(entryPath);
    let passedTitles = reported;
    if (!passedTitles && previous && previous.sha256 === sha256)
      passedTitles = previous.passedTitles;
    if (!passedTitles) {
      missing.push(entryPath);
      passedTitles = [];
    }
    return { path: entryPath, sha256, passedTitles: [...passedTitles] };
  };
  return {
    contract: {
      version: 1,
      brand: entryFor(BRAND_PATH),
      storage: STORAGE_PATHS.map(entryFor),
    },
    missing,
  };
}

export function diffContracts(current, next) {
  const before = new Map(
    current
      ? [current.brand, ...(current.storage ?? [])].map((entry) => [
          entry.path,
          entry,
        ])
      : [],
  );
  const files = [next.brand, ...next.storage].map((entry) => {
    const previous = before.get(entry.path);
    const oldTitles = previous?.passedTitles ?? [];
    const oldSet = new Set(oldTitles);
    const newSet = new Set(entry.passedTitles);
    const added = entry.passedTitles.filter((title) => !oldSet.has(title));
    const removed = oldTitles.filter((title) => !newSet.has(title));
    return {
      path: entry.path,
      isNew: !previous,
      oldSha256: previous?.sha256 ?? null,
      newSha256: entry.sha256,
      hashChanged: previous?.sha256 !== entry.sha256,
      added,
      removed,
      isChanged:
        !previous ||
        previous.sha256 !== entry.sha256 ||
        added.length > 0 ||
        removed.length > 0,
    };
  });
  return {
    files,
    isChanged: files.some((file) => file.isChanged),
    hasRemovedTitles: files.some((file) => file.removed.length > 0),
  };
}

// `commits` is newest-first history of one path. Returns the commits newer than
// the one whose content matches the pinned hash (the previous signing point).
export function commitsSincePin(commits, pinnedSha256, blobHashAt) {
  if (!pinnedSha256) return { commits: [], isBaselineFound: false };
  const since = [];
  for (const commit of commits) {
    if (blobHashAt(commit.sha) === pinnedSha256)
      return { commits: since, isBaselineFound: true };
    since.push(commit);
  }
  return { commits: since, isBaselineFound: false };
}

export function formatDiff(
  diff,
  { histories = new Map(), color = false } = {},
) {
  const paint = (code, text) =>
    color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const red = (text) => paint('1;31', text);
  const green = (text) => paint('32', text);
  const dim = (text) => paint('2', text);
  const lines = [];
  for (const file of diff.files) {
    if (!file.isChanged) {
      lines.push(dim(`  unchanged  ${file.path}`));
      continue;
    }
    lines.push(`  CHANGED    ${file.path}`);
    lines.push(
      `    sha256 ${file.oldSha256?.slice(0, 12) ?? '(none)'} -> ${file.newSha256.slice(0, 12)}${file.hashChanged ? '' : ' (hash unchanged)'}`,
    );
    const history = histories.get(file.path);
    if (history) {
      for (const commit of history.commits)
        lines.push(`    commit ${commit.shortSha} ${commit.subject}`);
      if (!history.isBaselineFound)
        lines.push(
          dim(
            '    (pinned version not found in recent history; list may be partial)',
          ),
        );
    }
    for (const title of file.added) lines.push(green(`    + ${title}`));
    for (const title of file.removed)
      lines.push(red(`    - REMOVED TITLE: ${title}`));
  }
  if (diff.hasRemovedTitles)
    lines.push(
      '',
      red(
        'WARNING: passing titles were REMOVED. Confirm each removal is a deliberate rename or deletion, not a weakened test.',
      ),
    );
  return lines.join('\n');
}

export function validateNext(contract) {
  const problems = [];
  for (const [name, validate] of [
    ['validateOwnerContract', validateOwnerContract],
    ['validateBrandOwnerContract', validateBrandOwnerContract],
  ]) {
    try {
      validate(JSON.stringify(contract));
    } catch (error) {
      problems.push(`${name}: ${error.code ?? error.message}`);
    }
  }
  return problems;
}

// ---- side-effecting shell helpers (not unit-tested) ----

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: MAX_BLOB,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

const git = (args, options) => run('git', args, options);

const blobAt = (commit, filePath) =>
  execFileSync('git', ['show', `${commit}:${filePath}`], {
    maxBuffer: MAX_BLOB,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function readCurrentVariable(repo) {
  try {
    return JSON.parse(
      run('gh', ['variable', 'get', VARIABLE_NAME, '--repo', repo]),
    );
  } catch (error) {
    process.stderr.write(
      `Could not read ${VARIABLE_NAME} from ${repo} (${String(error.stderr ?? error.message).trim()}); diffing against an empty contract.\n`,
    );
    return null;
  }
}

function historyFor(sha, filePath, pinnedSha256) {
  const output = git([
    'log',
    `--format=%H%x09%h%x09%s`,
    '-n',
    String(HISTORY_LIMIT),
    sha,
    '--',
    filePath,
  ]);
  const commits = output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [full, shortSha, ...subject] = line.split('\t');
      return { sha: full, shortSha, subject: subject.join('\t') };
    });
  return commitsSincePin(commits, pinnedSha256, (commit) => {
    try {
      return sha256Hex(blobAt(commit, filePath));
    } catch {
      return null;
    }
  });
}

async function confirm(question) {
  if (!process.stdin.isTTY)
    throw new Error('Confirmation needs an interactive terminal.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

export async function main(argv) {
  const options = parseArguments(argv);
  if (options.ref === DEFAULT_REF) {
    try {
      git(['fetch', '--quiet', 'origin', 'master']);
    } catch {
      process.stderr.write('Warning: could not fetch origin/master.\n');
    }
  }
  const sha = git(['rev-parse', '--verify', `${options.ref}^{commit}`]).trim();
  const current = readCurrentVariable(options.repo);
  const hashes = new Map(
    CONTRACT_PATHS.map((entry) => [entry, sha256Hex(blobAt(sha, entry))]),
  );
  const titlesByPath = options.report
    ? titlesFromReport(JSON.parse(readFileSync(options.report, 'utf8')))
    : new Map();
  const { contract, missing } = buildNextContract({
    current,
    hashes,
    titlesByPath,
  });

  process.stdout.write(
    `${VARIABLE_NAME} re-sign against ${sha} (${options.ref}) for ${options.repo}\n\n`,
  );
  const diff = diffContracts(current, contract);
  const histories = new Map();
  for (const file of diff.files) {
    if (file.hashChanged && file.oldSha256)
      histories.set(file.path, historyFor(sha, file.path, file.oldSha256));
  }
  process.stdout.write(
    `${formatDiff(diff, { color: process.stdout.isTTY === true, histories })}\n\n`,
  );

  if (missing.length > 0) {
    process.stdout.write(
      `Titles are unknown for ${missing.length} changed file(s); run those specs and pass the vitest JSON report with --report <file>:\n${missing.map((entry) => `  ${entry}`).join('\n')}\n`,
    );
    return 2;
  }
  const problems = validateNext(contract);
  const localAcceptance = sha256Hex(
    readFileSync(
      path.resolve(
        fileURLToPath(import.meta.url),
        '../../..',
        ACCEPTANCE_MODULE,
      ),
    ),
  );
  if (localAcceptance !== sha256Hex(blobAt(sha, ACCEPTANCE_MODULE)))
    problems.push(
      `local ${ACCEPTANCE_MODULE} differs from ${sha}; check out that commit so validation uses its contract`,
    );
  if (problems.length > 0) {
    process.stdout.write(
      `Validation FAILED:\n${problems.map((entry) => `  ${entry}`).join('\n')}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `Validation passed (brand pin matches code-side BRAND_SOURCE_CONTRACT ${BRAND_SOURCE_CONTRACT.brand.sha256.slice(0, 12)}).\n`,
  );
  if (!diff.isChanged) {
    process.stdout.write('Variable is already up to date; nothing to do.\n');
    return 0;
  }
  if (options.dryRun) {
    process.stdout.write('Dry run: not prompting and not writing.\n');
    return 0;
  }
  if (!(await confirm(`Set ${VARIABLE_NAME} on ${options.repo}? [y/N] `))) {
    process.stdout.write('Aborted; variable not changed.\n');
    return 1;
  }
  run('gh', [
    'variable',
    'set',
    VARIABLE_NAME,
    '--repo',
    options.repo,
    '--body',
    JSON.stringify(contract),
  ]);
  process.stdout.write(`${VARIABLE_NAME} updated.\n`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    return 1;
  });
}
