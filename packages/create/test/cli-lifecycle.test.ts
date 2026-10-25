import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const logsCommand =
  'docker compose --env-file .env -f compose.yml logs genfeed';
let fixtureDirectory: string;

beforeAll(async () => {
  fixtureDirectory = await realpath(
    await mkdtemp(join(tmpdir(), 'genfeed-cli-lifecycle-')),
  );
  const runtime = join(fixtureDirectory, 'runtime');
  const bundle = join(fixtureDirectory, 'bundle');
  const bin = join(fixtureDirectory, 'bin');
  await Promise.all([
    mkdir(join(runtime, 'dist'), { recursive: true }),
    mkdir(bundle),
    mkdir(bin),
  ]);
  await symlink(
    join(packageDirectory, 'node_modules'),
    join(runtime, 'node_modules'),
  );
  await writeFile(
    join(runtime, 'package.json'),
    await readFile(join(packageDirectory, 'package.json')),
  );
  for (const name of ['index', 'wizard', 'setup']) {
    const source = await readFile(
      join(packageDirectory, 'src', `${name}.ts`),
      'utf8',
    );
    await writeFile(
      join(runtime, 'dist', `${name}.js`),
      stripTypeScriptTypes(source),
    );
  }
  await Promise.all([
    writeFile(join(bundle, '.env.example'), 'GENFEED_IMAGE_TAG=0.5.0\n'),
    writeFile(join(bundle, 'compose.yml'), 'services: {}\n'),
    writeFile(
      join(bundle, 'release.json'),
      JSON.stringify({
        schemaVersion: 1,
        releaseTag: 'v0.5.0',
        image: 'ghcr.io/genfeedai/genfeed.ai:0.5.0',
      }),
    ),
  ]);
  const archive = join(fixtureDirectory, 'bundle.tar.gz');
  const packed = spawnSync('tar', [
    '-czf',
    archive,
    '-C',
    fixtureDirectory,
    'bundle',
  ]);
  expect(packed.status).toBe(0);
  const digest = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  await writeFile(
    join(fixtureDirectory, 'preload.mjs'),
    `
    import { readFileSync } from 'node:fs';
    const archive = readFileSync(${JSON.stringify(archive)});
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('.tar.gz')) return new Response(archive);
      if (url.endsWith('.sha256')) return new Response('${digest}  genfeed-selfhosted.tar.gz\\n');
      if (url !== 'http://localhost:3000') throw new Error('Unexpected fixture request');
      if (process.env.FIXTURE_MODE === 'redirect') return new Response(null, { status: 302 });
      if (['ready', 'array-ready', 'unhealthy-ready'].includes(process.env.FIXTURE_MODE)) return new Response('ready');
      if (process.env.FIXTURE_MODE === 'crashes') throw new Error('Fixture connection refused');
      Date.now = () => Number.MAX_SAFE_INTEGER;
      throw new Error('Fixture connection refused');
    };
  `,
  );
  await writeFile(
    join(bin, 'docker'),
    `#!${process.execPath}
    const { appendFileSync, readFileSync } = require('node:fs');
    const args = process.argv.slice(2);
    appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
    const command = args[1] === 'version' ? 'version' : args[5];
    if (command === 'version' || command === 'config') process.exit(0);
    if (command === 'up') process.exit(process.env.FIXTURE_MODE === 'up-failure' ? 23 : 0);
    if (command !== 'ps') process.exit(99);
    if (process.env.FIXTURE_MODE === 'status-failure') process.exit(17);
    if (process.env.FIXTURE_MODE === 'invalid-status') { process.stdout.write('not json'); process.exit(0); }
    if (process.env.FIXTURE_MODE === 'invalid-shape') { process.stdout.write('{"State":"running"}'); process.exit(0); }
    if (process.env.FIXTURE_MODE === 'missing') process.exit(0);
    const probes = readFileSync(process.env.FIXTURE_CALLS, 'utf8').split('\\n').filter(line => line.includes('"ps"')).length;
    const state = process.env.FIXTURE_MODE === 'exited' || (process.env.FIXTURE_MODE === 'crashes' && probes > 1) ? 'exited' : 'running';
    const health = process.env.FIXTURE_MODE.startsWith('unhealthy') ? 'unhealthy' : 'starting';
    const container = { Service: 'genfeed', State: state, Health: health, ExitCode: state === 'exited' ? 42 : 0 };
    const json = JSON.stringify(container);
    process.stdout.write(process.env.FIXTURE_MODE.startsWith('array-') ? '[' + json + ']' : json + '\\n');
  `,
    { mode: 0o700 },
  );
  for (const browser of ['open', 'xdg-open']) {
    await writeFile(join(bin, browser), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  }
});

afterAll(async () => {
  if (fixtureDirectory)
    await rm(fixtureDirectory, { recursive: true, force: true });
});

async function runCli(mode: string) {
  const installation = join(fixtureDirectory, mode);
  const calls = join(fixtureDirectory, `${mode}.calls`);
  const child = spawn(
    process.execPath,
    [
      '--import',
      join(fixtureDirectory, 'preload.mjs'),
      join(fixtureDirectory, 'runtime', 'dist', 'index.js'),
      installation,
      '--release',
      'v0.5.0',
      '--yes',
    ],
    {
      cwd: fixtureDirectory,
      env: {
        PATH: `${join(fixtureDirectory, 'bin')}:${process.env.PATH}`,
        OPENROUTER_API_KEY: 'sk-or-offline-fixture',
        SELFHOSTED_DOMAIN: '',
        FIXTURE_MODE: mode,
        FIXTURE_CALLS: calls,
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data: Buffer) => {
    output += data.toString();
  });
  child.stderr.on('data', (data: Buffer) => {
    output += data.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI fixture timed out: ${output}`));
    }, 8_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (status) => {
      clearTimeout(timeout);
      resolve(status);
    });
  });
  return { code, output, installation, calls: await readFile(calls, 'utf8') };
}

describe('CLI readiness outcome', () => {
  it.each([
    ['exited', 'exited with code 42'],
    ['crashes', 'exited with code 42'],
    ['unhealthy', 'unhealthy'],
    ['unhealthy-ready', 'unhealthy'],
    ['missing', 'No genfeed container'],
    ['invalid-status', 'Could not read the genfeed container status'],
    ['invalid-shape', 'Could not read the genfeed container status'],
    ['status-failure', 'Could not read the genfeed container status'],
    ['timeout', 'did not become ready within 180 seconds'],
    ['array-status', 'did not become ready within 180 seconds'],
  ])(
    'exits nonzero for %s and preserves recovery files',
    async (mode, diagnostic) => {
      const result = await runCli(mode);
      expect(result.code).toBe(1);
      expect(result.output).toContain(diagnostic);
      expect(result.output).toContain(logsCommand);
      expect(result.output).toContain('Installation files were preserved');
      expect(result.output).not.toContain('Genfeed.ai is running');
      expect(result.output).not.toContain('sk-or-offline-fixture');
      expect(
        await readFile(join(result.installation, '.env'), 'utf8'),
      ).toContain('GENFEED_IMAGE_TAG=0.5.0');
      const calls = result.calls
        .trim()
        .split('\n')
        .map((line): unknown => JSON.parse(line));
      expect(calls).toContainEqual({
        args: [
          'compose',
          '--env-file',
          '.env',
          '-f',
          'compose.yml',
          'ps',
          '--all',
          '--format',
          'json',
          'genfeed',
        ],
        cwd: result.installation,
      });
    },
  );

  it.each(['ready', 'redirect', 'array-ready'])(
    'keeps %s readiness successful',
    async (mode) => {
      const result = await runCli(mode);
      expect(result.code).toBe(0);
      expect(result.output).toContain(
        'Genfeed.ai is running at http://localhost:3000',
      );
      expect(result.output).not.toContain('Startup failed');
    },
  );

  it('keeps the original startup command failure and recovery files', async () => {
    const result = await runCli('up-failure');
    expect(result.code).toBe(1);
    expect(result.output).toContain('failed with 23');
    expect(result.output).toContain(logsCommand);
    expect(
      await readFile(join(result.installation, 'release.json'), 'utf8'),
    ).toContain('v0.5.0');
  });
});
