#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const DEFAULT_CONFIG = 'playwright/configs/playwright.config.ts';
const DEFAULT_PROJECT = 'app-core';
const CORE_TEST_PATHS = [
  'playwright/e2e/tests/smoke',
  'playwright/e2e/tests/core',
  'playwright/e2e/tests/shell/page-context-contract.spec.ts',
  'playwright/e2e/tests/studio/clips.spec.ts',
];

function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

function usage() {
  writeStdout(`Usage:
  node scripts/e2e-sharded.mjs --shard=1/12 [--project=app-core] [--scope=core|all] [--] [playwright args...]
  E2E_SHARD_INDEX=1 E2E_TOTAL_SHARDS=12 node scripts/e2e-sharded.mjs -- --reporter=blob

Defaults:
  --config=${DEFAULT_CONFIG}
  --project=${DEFAULT_PROJECT}
  --scope=core
  --retries  (unset: playwright.config.ts decides via E2E_RETRIES / isCI ? 2 : 0)`);
}

function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total)) {
    return null;
  }
  if (index < 1 || total < 1 || index > total) {
    return null;
  }

  return `${index}/${total}`;
}

function readShardFromEnv() {
  const combined = parseShard(process.env.E2E_SHARD);
  if (combined) {
    return combined;
  }

  const index = process.env.E2E_SHARD_INDEX;
  const total = process.env.E2E_TOTAL_SHARDS;
  if (!index || !total) {
    return null;
  }

  return parseShard(`${index}/${total}`);
}

function hasOption(args, name) {
  return args.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

const rawArgs = process.argv.slice(2);
const separatorIndex = rawArgs.indexOf('--');
const ownArgs =
  separatorIndex === -1 ? rawArgs : rawArgs.slice(0, separatorIndex);
const playwrightArgs =
  separatorIndex === -1 ? [] : rawArgs.slice(separatorIndex + 1);

let config = DEFAULT_CONFIG;
let project = DEFAULT_PROJECT;
let scope = 'core';
let shard = null;
// Retries are owned by playwright.config.ts (it reads E2E_RETRIES directly, else
// isCI ? 2 : 0). This runner only forwards an EXPLICIT `--retries=` override and
// must never inject a default — the old `?? '0'` clobbered the config's CI
// default of 2 on the deploy gate, silently disabling flake retries there.
let explicitRetries = null;

for (let i = 0; i < ownArgs.length; i += 1) {
  const arg = ownArgs[i];

  if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  }

  if (arg.startsWith('--shard=')) {
    shard = parseShard(arg.slice('--shard='.length));
    continue;
  }

  if (arg.startsWith('--project=')) {
    project = arg.slice('--project='.length);
    continue;
  }

  if (arg.startsWith('--config=')) {
    config = arg.slice('--config='.length);
    continue;
  }

  if (arg.startsWith('--scope=')) {
    scope = arg.slice('--scope='.length);
    continue;
  }

  if (arg.startsWith('--retries=')) {
    explicitRetries = arg.slice('--retries='.length);
    continue;
  }

  playwrightArgs.push(arg);
}

shard ??= readShardFromEnv();

if (!shard) {
  writeStderr(
    'Missing or invalid shard. Provide --shard=N/T or E2E_SHARD_INDEX + E2E_TOTAL_SHARDS.',
  );
  usage();
  process.exit(1);
}

if (!['core', 'all'].includes(scope)) {
  writeStderr(`Unsupported scope "${scope}". Expected "core" or "all".`);
  process.exit(1);
}

const testPaths = scope === 'core' ? CORE_TEST_PATHS : [];
const args = ['playwright', 'test', `--config=${config}`, ...testPaths];

if (project && !hasOption(playwrightArgs, '--project')) {
  args.push(`--project=${project}`);
}

args.push(`--shard=${shard}`);

// Only forward retries when explicitly overridden on the CLI; otherwise leave it
// to playwright.config.ts (single authority — see explicitRetries above).
if (explicitRetries !== null && !hasOption(playwrightArgs, '--retries')) {
  args.push(`--retries=${explicitRetries}`);
}

args.push(...playwrightArgs);

writeStdout(
  `[e2e-sharded] running ${project || 'all projects'} shard ${shard} (scope: ${scope}, retries: ${explicitRetries ?? 'config/E2E_RETRIES'})`,
);

const result = spawnSync('bunx', args, {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  writeStderr(result.error.message);
  process.exit(1);
}

if (result.signal) {
  writeStderr(`[e2e-sharded] terminated by signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
