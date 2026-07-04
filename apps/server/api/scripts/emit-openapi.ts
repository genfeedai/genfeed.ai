/**
 * Deterministic OpenAPI spec emitter (#1247).
 *
 * Builds the compiled api bundle and runs it with OPENAPI_EMIT_PATH set — the
 * emit gate in main.ts writes the full document (stable operationIds, sorted
 * keys) and exits before any middleware, queues, or the listener start, so no
 * database/Redis connectivity is needed. The child env pins everything that
 * could influence the document, so output is byte-stable across machines.
 *
 * Usage:
 *   bun run scripts/emit-openapi.ts                  # build + emit to openapi/openapi.json
 *   bun run scripts/emit-openapi.ts --skip-build     # reuse existing dist bundle
 *   bun run scripts/emit-openapi.ts --out=/tmp/x.json
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptsDir, '..');
const serverDir = resolve(apiDir, '..');
const bundlePath = join(serverDir, 'dist', 'apps', 'api', 'main.js');

const DEFAULT_OUT = join(apiDir, 'openapi', 'openapi.json');

function parseArgs(): { out: string; isBuildSkipped: boolean } {
  const args = process.argv.slice(2);
  const outArg = args.find((arg) => arg.startsWith('--out='))?.split('=')[1];
  const out = outArg
    ? isAbsolute(outArg)
      ? outArg
      : resolve(process.cwd(), outArg)
    : DEFAULT_OUT;

  return { isBuildSkipped: args.includes('--skip-build'), out };
}

function run(
  command: string,
  commandArgs: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): void {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(
      `Command failed (${result.status}): ${command} ${commandArgs.join(' ')}`,
    );
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const { isBuildSkipped, out } = parseArgs();

  if (!isBuildSkipped) {
    console.info('Building compiled api bundle (nest build api)...');
    run('bunx', ['nest', 'build', 'api'], { cwd: serverDir });
  }

  if (!existsSync(bundlePath)) {
    console.error(
      `Compiled bundle not found at ${bundlePath} — run without --skip-build`,
    );
    process.exit(1);
  }

  // Fully pinned child env: NODE_ENV=test keeps the DevModule out of the
  // graph (matching production) and stops the bootstrap from picking up
  // personal .env/.env.local files; the placeholder DATABASE_URL and secrets
  // satisfy config validation but are never dialed because the emit gate
  // exits before app.init()/listen. GENFEED_CLOUD is dropped so cloud-only
  // env conditionals stay optional regardless of the host shell.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BETTER_AUTH_SECRET: 'openapi-emit-placeholder',
    DATABASE_URL: 'postgresql://127.0.0.1:5432/openapi_emit',
    NODE_ENV: 'test',
    OPENAPI_EMIT_PATH: out,
    PORT: '3010',
  };
  delete childEnv.GENFEED_CLOUD;
  delete childEnv.VERSION;
  delete childEnv.npm_package_version;
  delete childEnv.npm_package_description;

  console.info(`Emitting OpenAPI document to ${out}...`);
  run('node', [bundlePath], { cwd: serverDir, env: childEnv });

  console.info('OpenAPI emit complete.');
}

main();
