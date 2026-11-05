#!/usr/bin/env node
/**
 * Driver for the database load suite.
 *
 *   node scripts/db-load/run.mjs seed    --scales 1,10,100,1000
 *   node scripts/db-load/run.mjs profile --label before --scales 1,10,100,1000
 *   node scripts/db-load/run.mjs report  --dir db-load-results
 *
 * Databases live on a disposable local Postgres (default 127.0.0.1:55432,
 * names `genfeed_loadtest_<scale>x`). Override with LOADTEST_PG_BASE
 * (e.g. postgresql://postgres@127.0.0.1:5432). Production URLs are refused by
 * `assertIsolatedDatabaseUrl`.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const API_ROOT = path.resolve(import.meta.dirname, '..', '..');
const [command, ...rest] = process.argv.slice(2);

function flag(name, fallback) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
}

const scales = flag('scales', '1,10,100,1000').split(',').map(Number);
const pgBase =
  process.env.LOADTEST_PG_BASE ?? 'postgresql://postgres@127.0.0.1:55432';

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: API_ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (command === 'seed') {
  for (const scale of scales) {
    run('bun', [
      '--tsconfig-override=tsconfig.json',
      'run',
      'scripts/db-load/seed.ts',
      '--scale',
      String(scale),
      '--url',
      `${pgBase}/genfeed_loadtest_${scale}x`,
    ]);
  }
} else if (command === 'profile') {
  const label = flag('label', 'before');
  const out = path.resolve(flag('out', 'db-load-results'));
  for (const scale of scales) {
    run('bunx', ['vitest', 'run', '--config', 'vitest.config.db-load.ts'], {
      LOADTEST_LABEL: label,
      LOADTEST_OUT: out,
      LOADTEST_SAMPLES: flag('samples', process.env.LOADTEST_SAMPLES ?? '45'),
      LOADTEST_ROUNDS: flag('rounds', process.env.LOADTEST_ROUNDS ?? '3'),
      LOADTEST_SCALE: String(scale),
      LOADTEST_DATABASE_URL: `${pgBase}/genfeed_loadtest_${scale}x`,
    });
  }
} else if (command === 'report') {
  run('bun', [
    '--tsconfig-override=tsconfig.json',
    'run',
    'scripts/db-load/report.ts',
    '--dir',
    path.resolve(flag('dir', 'db-load-results')),
  ]);
} else {
  process.stderr.write(
    'usage: run.mjs <seed|profile|report> [--scales 1,10,100,1000] [--label before|after]\n',
  );
  process.exit(2);
}
