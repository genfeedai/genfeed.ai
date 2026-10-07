#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  allPackageTestTasks,
  buildPackageTestMatrix,
} from './workspace-test-matrix.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ZERO_SHA = '0000000000000000000000000000000000000000';
const COMMAND_MAX_BUFFER = 50 * 1024 * 1024;
const execFileAsync = promisify(execFile);

const FORCE_FULL_PATTERNS = [
  /^bun\.lock$/,
  /^turbo\.json$/,
  /(^|\/)vitest\.(?:config|setup)\.[cm]?[jt]sx?$/,
  /^\.github\/actions\/setup-bun-env\//,
  /^scripts\/ci\/(?:pr-test-plan|tests-gate)\.mjs$/,
  /^scripts\/ci\/workspace-test-matrix\.mjs$/,
];

// Keep dormant surface definitions in the planner so they can be restored
// without reconstructing their CI contract. Remove a group from this set when
// that surface becomes an active delivery target again.
//
// This is the single source of truth for surface dormancy: `tests-gate.mjs`
// imports it so the gate summary can label a paused surface as dormant instead
// of reporting it as an ordinary out-of-scope skip (#2486). A dormant group is
// forced inapplicable here even under `--run-heavy`, so the `full-suite` label
// escalates every other group but cannot revive this one.
export const TEMPORARILY_DISABLED_TEST_GROUPS = new Set(['ide-extension']);

// A queue checkout includes all proposed changes above its frozen base.
// Master/release validation still forces both surfaces on.
const CHANGE_RUN_EVENTS = new Set(['pull_request', 'merge_group']);

export function isChangeRunEvent(eventName) {
  return CHANGE_RUN_EVENTS.has(eventName);
}

const TURBO_TEST_GROUPS = {
  'browser-extension': ['--filter=@genfeedai/extension-browser'],
  'ide-extension': ['--filter=extension-ide'],
  packages: ['--filter=./packages/*'],
  server: ['--filter=./apps/server/*', '--filter=!@genfeedai/api'],
  web: [
    '--filter=@genfeedai/website',
    '--filter=@genfeedai/docs',
    // Temporarily disabled while desktop is not an active delivery surface:
    // '--filter=@genfeedai/desktop',
    '--filter=@genfeedai/mobile',
  ],
};

function matchesAny(files, patterns) {
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

export function classifyChangedFiles(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    throw new TypeError('changedFiles must be an array');
  }

  const forceFull = matchesAny(changedFiles, FORCE_FULL_PATTERNS);
  if (forceFull) {
    return { api: true, app: true, forceFull: true };
  }

  const app = matchesAny(changedFiles, [/^apps\/app(?:\/|$)/, /^packages\//]);
  const api = matchesAny(changedFiles, [
    /^apps\/server\/api(?:\/|$)/,
    /^packages\//,
  ]);

  return { api, app, forceFull: false };
}

export const FULL_SUITE_SHARDS = 4;

export function selectShardCount(testFileCount) {
  if (!Number.isSafeInteger(testFileCount) || testFileCount < 0) {
    throw new TypeError('testFileCount must be a non-negative integer');
  }
  if (testFileCount === 0) return 0;
  if (testFileCount <= 75) return 1;
  if (testFileCount <= 250) return 2;
  return 4;
}

export function createShardMatrix(shardCount) {
  if (![0, 1, 2, 4].includes(shardCount)) {
    throw new RangeError('shardCount must be one of 0, 1, 2, or 4');
  }

  return {
    include: Array.from({ length: shardCount }, (_, index) => ({
      shard: index + 1,
      total: shardCount,
    })),
  };
}

export function parseVitestList(rawOutput, repositoryRoot = REPOSITORY_ROOT) {
  let parsed;
  try {
    parsed = JSON.parse(rawOutput || '[]');
  } catch (error) {
    throw new Error(
      `Vitest list output was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new TypeError('Vitest list output must be an array');
  }

  const files = new Set();
  for (const entry of parsed) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.file !== 'string' ||
      !path.isAbsolute(entry.file)
    ) {
      throw new TypeError(
        'Vitest list entry must contain an absolute file path',
      );
    }

    const relativeFile = path.relative(repositoryRoot, entry.file);
    if (
      relativeFile === '' ||
      relativeFile === '..' ||
      relativeFile.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeFile)
    ) {
      throw new Error(
        `Vitest listed a file outside the repository: ${entry.file}`,
      );
    }
    files.add(relativeFile.split(path.sep).join('/'));
  }

  return [...files].sort();
}

export function parseTurboDryRun(rawOutput) {
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch (error) {
    throw new Error(
      `Turbo dry-run output was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed?.tasks)) {
    throw new TypeError('Turbo dry-run output must contain a tasks array');
  }

  const tasks = new Set();
  for (const task of parsed.tasks) {
    if (typeof task !== 'object' || task === null) continue;

    const taskId =
      typeof task.taskId === 'string'
        ? task.taskId
        : typeof task.package === 'string' && typeof task.task === 'string'
          ? `${task.package}#${task.task}`
          : '';
    const taskName =
      typeof task.task === 'string'
        ? task.task
        : taskId.slice(taskId.lastIndexOf('#') + 1);

    if (taskId && taskName === 'test') tasks.add(taskId);
  }

  return [...tasks].sort();
}

export function createPrTestPlan({
  base,
  changedFiles,
  appTests = [],
  apiTests = [],
  turboTasks = {},
  forceAllSurfaces = false,
  runHeavy = false,
}) {
  const classification = classifyChangedFiles(changedFiles);
  const forceFull = runHeavy || classification.forceFull;
  const app = forceAllSurfaces || forceFull || classification.app;
  const api = forceAllSurfaces || forceFull || classification.api;
  // The full tier runs each whole suite over four shards; the affected tier
  // sizes the shards to the exact changed graph.
  const appShardCount = forceFull
    ? FULL_SUITE_SHARDS * Number(app)
    : selectShardCount(appTests.length);
  const apiShardCount = forceFull
    ? FULL_SUITE_SHARDS * Number(api)
    : selectShardCount(apiTests.length);

  const normalizedTurboTasks = Object.fromEntries(
    Object.keys(TURBO_TEST_GROUPS).map((group) => [
      group,
      group === 'packages' && forceFull
        ? allPackageTestTasks(REPOSITORY_ROOT).sort()
        : Array.isArray(turboTasks[group])
          ? [...turboTasks[group]].sort()
          : [],
    ]),
  );

  const workspaceGroups = Object.fromEntries(
    Object.entries(normalizedTurboTasks).map(([group, tasks]) => [
      group,
      !TEMPORARILY_DISABLED_TEST_GROUPS.has(group) &&
        (runHeavy ||
          classification.forceFull ||
          tasks.length > 0 ||
          (group === 'browser-extension' &&
            changedFiles.some((file) =>
              file.startsWith('apps/extensions/browser/'),
            ))),
    ]),
  );

  return {
    version: 1,
    base,
    changedFiles: [...changedFiles].sort(),
    forceFull,
    setupBenchmark: changedFiles.some(
      (file) => file === '.github/actions/setup-bun-env/action.yml',
    ),
    surfaces: { api, app },
    appTests: {
      applicable: app && (forceFull || appTests.length > 0),
      count: appTests.length,
      files: [...appTests],
      matrix: createShardMatrix(appShardCount),
      shards: appShardCount,
    },
    apiTests: {
      applicable: api && (forceFull || apiTests.length > 0),
      count: apiTests.length,
      files: [...apiTests],
      matrix: createShardMatrix(apiShardCount),
      shards: apiShardCount,
    },
    turboTasks: normalizedTurboTasks,
    workspaceGroups,
    // Package pools preserve the selected union; UI uses four distinct shards.
    // Other surfaces keep their existing applicability and coverage.
    workspaceMatrix: {
      include: Object.entries(workspaceGroups)
        .filter(([, applies]) => applies)
        .flatMap(([group]) =>
          group === 'packages'
            ? buildPackageTestMatrix(normalizedTurboTasks.packages)
            : [
                {
                  group,
                  name: group,
                  filters: TURBO_TEST_GROUPS[group].join(' '),
                  ui_shard: '',
                },
              ],
        ),
    },
  };
}

async function runCommand(command, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd ?? REPOSITORY_ROOT,
      encoding: 'utf8',
      env: options.env ?? process.env,
      maxBuffer: COMMAND_MAX_BUFFER,
    });
    return stdout;
  } catch (error) {
    const detail = [error?.stderr, error?.stdout]
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(-4000);
    throw new Error(
      `${command} ${args.join(' ')} failed${
        Number.isInteger(error?.code) ? ` with exit ${error.code}` : ''
      }${error instanceof Error ? `: ${error.message}` : ''}${
        detail ? `\n${detail}` : ''
      }`,
    );
  }
}

function normalizeBase(base) {
  if (!base || base === ZERO_SHA) return 'HEAD~1';
  return base;
}

export async function readChangedFiles(base, commandRunner = runCommand) {
  const output = await commandRunner('git', [
    'diff',
    '--name-only',
    '--diff-filter=ACDMR',
    '-z',
    base,
    'HEAD',
  ]);
  return output.split('\0').filter(Boolean);
}

async function listVitestFiles({ base, config, cwd }) {
  const output = await runCommand(
    'bunx',
    [
      'vitest',
      'list',
      '--config',
      config,
      '--filesOnly',
      '--changed',
      base,
      '--json',
      '--no-color',
      '--staticParse',
    ],
    {
      cwd,
      env: {
        ...process.env,
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET || 'test-better-auth-secret',
        CI: 'true',
        NODE_ENV: 'test',
      },
    },
  );
  return parseVitestList(output);
}

async function listTurboTasks(base, filters) {
  const output = await runCommand(
    'bunx',
    ['turbo', 'run', 'test', '--affected', ...filters, '--dry=json'],
    {
      env: {
        ...process.env,
        TURBO_SCM_BASE: base,
      },
    },
  );
  return parseTurboDryRun(output);
}

function parseArguments(argv) {
  const values = {
    base: '',
    event: '',
    runHeavy: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--base') {
      values.base = argv[index + 1] ?? '';
      index += 1;
    } else if (argument === '--event') {
      values.event = argv[index + 1] ?? '';
      index += 1;
    } else if (argument === '--run-heavy') {
      values.runHeavy = (argv[index + 1] ?? '') === 'true';
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!values.event) throw new Error('--event is required');
  return values;
}

function writeOutputs(plan, manifestPath) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error('GITHUB_OUTPUT is required');
  }

  const outputs = {
    app: plan.surfaces.app,
    api: plan.surfaces.api,
    app_tests: plan.appTests.applicable,
    api_tests: plan.apiTests.applicable,
    app_count: plan.appTests.count,
    api_count: plan.apiTests.count,
    app_matrix: JSON.stringify(plan.appTests.matrix),
    api_matrix: JSON.stringify(plan.apiTests.matrix),
    force_full: plan.forceFull,
    setup_benchmark: plan.setupBenchmark,
    workspace_tests: plan.workspaceMatrix.include.length > 0,
    workspace_matrix: JSON.stringify(plan.workspaceMatrix),
    manifest: manifestPath,
  };

  appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('\n')}\n`,
  );
}

function writeSummary(plan) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const rows = [
    [
      'App tests',
      plan.forceFull ? 'all' : plan.appTests.count,
      plan.appTests.shards,
    ],
    [
      'API tests',
      plan.forceFull ? 'all' : plan.apiTests.count,
      plan.apiTests.shards,
    ],
  ];
  const groupRows = Object.entries(plan.workspaceGroups).map(
    ([group, applies]) => [group, applies ? 'run' : 'skip'],
  );
  const summary = [
    '# Pull-request test plan',
    '',
    `- Base: \`${plan.base}\``,
    `- Full-suite escalation: ${plan.forceFull ? 'yes' : 'no'}`,
    '',
    '| Surface | Test files | Shards |',
    '| --- | ---: | ---: |',
    ...rows.map(
      ([surface, count, shards]) => `| ${surface} | ${count} | ${shards} |`,
    ),
    '',
    '| Workspace group | Plan |',
    '| --- | --- |',
    ...groupRows.map(([group, disposition]) => `| ${group} | ${disposition} |`),
    '',
  ].join('\n');

  appendFileSync(summaryPath, `${summary}\n`);
}

async function runCli() {
  const args = parseArguments(process.argv.slice(2));
  const base = normalizeBase(args.base);
  const changedFiles = await readChangedFiles(base);
  const classification = classifyChangedFiles(changedFiles);
  const forceFull = args.runHeavy || classification.forceFull;
  const forceAllSurfaces = !isChangeRunEvent(args.event);

  const appTestsPromise =
    !forceFull && (forceAllSurfaces || classification.app)
      ? listVitestFiles({
          base,
          config: './vitest.config.mts',
          cwd: path.join(REPOSITORY_ROOT, 'apps', 'app'),
        })
      : Promise.resolve([]);
  const apiTestsPromise =
    !forceFull && (forceAllSurfaces || classification.api)
      ? listVitestFiles({
          base,
          config: 'vitest.config.ts',
          cwd: path.join(REPOSITORY_ROOT, 'apps', 'server', 'api'),
        })
      : Promise.resolve([]);
  // Workspace groups are computed for every event, not just pull requests.
  // Non-pull-request runs are heavy, so they run every active group.
  const turboTaskEntriesPromise = Promise.all(
    Object.entries(TURBO_TEST_GROUPS).map(async ([group, filters]) => [
      group,
      !forceFull && !TEMPORARILY_DISABLED_TEST_GROUPS.has(group)
        ? await listTurboTasks(base, filters)
        : [],
    ]),
  );
  const [appTests, apiTests, turboTaskEntries] = await Promise.all([
    appTestsPromise,
    apiTestsPromise,
    turboTaskEntriesPromise,
  ]);
  const turboTasks = Object.fromEntries(turboTaskEntries);

  const plan = createPrTestPlan({
    base,
    changedFiles,
    appTests,
    apiTests,
    turboTasks,
    forceAllSurfaces,
    runHeavy: args.runHeavy,
  });
  const manifestPath = path.join(
    process.env.RUNNER_TEMP || REPOSITORY_ROOT,
    'pr-test-plan.json',
  );

  writeFileSync(manifestPath, `${JSON.stringify(plan, null, 2)}\n`);
  writeOutputs(plan, manifestPath);
  writeSummary(plan);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
