import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const workflow = readFileSync(
  path.join(root, '.github/workflows/bundle-size.yml'),
  'utf8',
);
const matrixApp = '$' + '{{ matrix.app }}';
const buildStep = workflow
  .split(`      - name: Build ${matrixApp}\n`)[1]
  ?.split('\n      - name:')[0];
const script = buildStep
  ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
  .replace(/^ {10}/gm, '');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function runScript(
  command: string | undefined,
  app: string,
  failUpstream = false,
  isolated = false,
) {
  if (!command) throw new Error('Missing workflow shell');
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'serializer-build-contract-'),
  );
  temporaryDirectories.push(directory);
  const log = path.join(directory, 'calls.jsonl');
  if (isolated)
    mkdirSync(path.join(directory, 'apps/app'), { recursive: true });
  const stub = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({ bin: path.basename(process.argv[1]), args }) + '\\n');
if (process.env.FAIL_UPSTREAM === '1' && args.includes('--filter=@genfeedai/app^...')) process.exit(17);
`;
  for (const executable of ['bun', 'bunx']) {
    const file = path.join(directory, executable);
    writeFileSync(file, stub);
    chmodSync(file, 0o755);
  }
  const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', command], {
    cwd: isolated ? directory : root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      CALL_LOG: log,
      BUNDLE_APP: app,
      FAIL_UPSTREAM: failUpstream ? '1' : '0',
    },
  });
  const calls: unknown[] = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { status: result.status, calls };
}

describe('pinned serializer bundle workflow', () => {
  it('builds dependencies and compiles the app once through its existing analyze script', () => {
    expect(buildStep).toContain(`BUNDLE_APP: ${matrixApp}`);
    expect(runScript(script, 'app')).toEqual({
      status: 0,
      calls: [
        {
          bin: 'bunx',
          args: [
            'turbo',
            'run',
            'build',
            '--filter=@genfeedai/app^...',
            '--concurrency=1',
          ],
        },
        { bin: 'bun', args: ['run', '--cwd', 'apps/app', 'analyze'] },
      ],
    });
  });

  it('preserves the website build and stops before app analysis when dependencies fail', () => {
    expect(runScript(script, 'website')).toEqual({
      status: 0,
      calls: [
        {
          bin: 'bunx',
          args: ['turbo', 'run', 'build', '--filter=@genfeedai/website'],
        },
      ],
    });
    expect(runScript(script, 'app', true)).toEqual({
      status: 17,
      calls: [
        {
          bin: 'bunx',
          args: [
            'turbo',
            'run',
            'build',
            '--filter=@genfeedai/app^...',
            '--concurrency=1',
          ],
        },
      ],
    });
  });

  it('replays four route snapshots serially without another compilation', () => {
    const proofStep = workflow
      .split('      - name: Verify deferred request serializers\n')[1]
      ?.split('\n      - name:')[0];
    const proofScript = proofStep
      ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
      .replace(/^ {10}/gm, '');
    const routes = [
      '/login',
      '/[orgSlug]/[brandSlug]/workspace/overview',
      '/[orgSlug]/[brandSlug]/library/assets',
      '/[orgSlug]/[brandSlug]/publishing/posts',
    ];
    expect(runScript(proofScript, 'app', false, true)).toEqual({
      status: 0,
      calls: routes.flatMap((route, index) => [
        { bin: 'bunx', args: ['next', 'analyze', 'export', '--route', route] },
        {
          bin: 'bun',
          args: [
            'run',
            'packages/services/scripts/request-serializer-bundle.ts',
            '.bundle-size/request-serializers.graph.jsonl',
            `.bundle-size/request-serializers-${index}.json`,
            route,
          ],
        },
      ]),
    });
  });

  it('selects app validation when only this workflow changes', () => {
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const { affectedFrontends, loadWorkspaces } = await import('./scripts/ci/frontend-scope.mjs'); console.log(JSON.stringify(affectedFrontends(['.github/workflows/bundle-size.yml'], loadWorkspaces(process.cwd()))));",
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(JSON.parse(result)).toEqual(['app', 'website']);
  });

  it('keeps advisory policy and restricts compact proof upload to the app and same-repo pull requests', () => {
    expect(workflow).toContain('    continue-on-error: true');
    expect(workflow).toContain(
      "        if: matrix.app == 'app' && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflow).toContain(
      '          path: .bundle-size/request-serializers-*.json',
    );
    expect(workflow).toContain(
      'bunx next analyze export --route "$BUNDLE_ROUTE"',
    );
    expect(workflow).not.toContain('turbo run build --analyze');
  });
});
