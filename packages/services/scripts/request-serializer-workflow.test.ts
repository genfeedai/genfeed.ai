import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  failProof = false,
  failReceipt = false,
  failInput = false,
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
if (process.env.FAIL_INPUT === '1' && args.includes('--finalize-input')) { fs.writeFileSync(args[2], JSON.stringify({ status: 'failed' })); process.exit(29); }
if (process.env.FAIL_RECEIPT === '1' && args.includes('packages/services/scripts/request-serializer-build-receipt.ts')) process.exit(19);
if (process.env.ISOLATED === '1' && args.includes('packages/services/scripts/request-serializer-build-receipt.ts')) {
  fs.mkdirSync(path.dirname(args[2]), { recursive: true });
  fs.writeFileSync(args[2], JSON.stringify({ mode: 'production-default', effectiveRequestCost: 200000, effectiveMaxChunkCountPerGroup: 40, effectiveMaxMergeChunkSize: 200000 }));
  fs.mkdirSync('packages/serializers/dist', { recursive: true });
  fs.writeFileSync('packages/serializers/dist/request-runtime.provenance.json', JSON.stringify({ schemaVersion: 1 }));
}
if (args.includes('scripts/collect-bundle-manifest.ts')) {
  const out = args[args.indexOf('--out') + 1];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ routes: [] }));
}
if (process.env.FAIL_PROOF === '1' && args.includes('packages/services/scripts/request-serializer-bundle.ts')) {
  fs.writeFileSync(args[3], JSON.stringify({ status: 'failed' }));
  process.exit(23);
}
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
      FAIL_PROOF: failProof ? '1' : '0',
      FAIL_RECEIPT: failReceipt ? '1' : '0',
      FAIL_INPUT: failInput ? '1' : '0',
      ISOLATED: isolated ? '1' : '0',
    },
  });
  const calls: unknown[] = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return {
    status: result.status,
    calls,
    ...(failProof || failInput
      ? {
          proofFiles: readdirSync(path.join(directory, '.bundle-size')).filter(
            (file) =>
              file.startsWith('request-serializers-') && file.endsWith('.json'),
          ),
        }
      : {}),
  };
}

function runBaselineReceipt(
  matchedKey: string,
  exactHit: boolean,
  includeBaseline = true,
) {
  const step = workflow
    .split('      - name: Retain serializer comparison baseline\n')[1]
    ?.split('\n      - name:')[0];
  const command = step
    ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
    .replace(/^ {10}/gm, '');
  if (!command) throw new Error('Missing baseline retention shell');
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'serializer-baseline-contract-'),
  );
  temporaryDirectories.push(directory);
  mkdirSync(path.join(directory, '.bundle-size'));
  const baseline =
    '{"app":"app","routes":[{"route":"/login","firstLoadGzipBytes":100}]}\n';
  if (includeBaseline)
    writeFileSync(path.join(directory, '.bundle-size/baseline.json'), baseline);
  const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', command], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      BUNDLE_BASE_SHA: 'a'.repeat(40),
      BUNDLE_SOURCE_SHA: 'b'.repeat(40),
      BUNDLE_REQUESTED_CACHE_KEY: `bundle-baseline-app-${'a'.repeat(40)}`,
      BUNDLE_MATCHED_CACHE_KEY: matchedKey,
      BUNDLE_EXACT_CACHE_HIT: exactHit ? 'true' : 'false',
    },
  });
  const retained = path.join(
    directory,
    '.bundle-size/request-serializers-baseline.json',
  );
  const identity = path.join(
    directory,
    '.bundle-size/request-serializers-baseline-identity.json',
  );
  const receipt: unknown = existsSync(identity)
    ? JSON.parse(readFileSync(identity, 'utf8'))
    : undefined;
  return {
    status: result.status,
    stderr: result.stderr,
    retained: existsSync(retained) ? readFileSync(retained, 'utf8') : null,
    baseline,
    receipt,
  };
}

describe('pinned serializer bundle workflow', () => {
  it('builds dependencies and captures real package/config provenance before exactly one app compilation', () => {
    expect(buildStep).toContain(`BUNDLE_APP: ${matrixApp}`);
    expect(buildStep).toContain(
      'cp packages/serializers/dist/request-runtime.provenance.json .bundle-size/request-serializers-package.json',
    );
    expect(buildStep).not.toContain('--trial');
    expect(runScript(script, 'app', false, true)).toEqual({
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
        {
          bin: 'bun',
          args: [
            'run',
            'packages/services/scripts/request-serializer-build-receipt.ts',
            '.bundle-size/request-serializers-build.json',
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
      calls: [
        {
          bin: 'bun',
          args: [
            'run',
            'packages/services/scripts/request-serializer-build-receipt.ts',
            '.bundle-size/request-serializers-input.json',
            '--finalize-input',
          ],
        },
        ...routes.flatMap((route, index) => [
          {
            bin: 'bunx',
            args: ['next', 'analyze', 'export', '--route', route],
          },
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
      ],
    });
  });

  it('retains a failure report while rejecting the proof and uploading its diagnostic artifact', () => {
    const proofStep = workflow
      .split('      - name: Verify deferred request serializers\n')[1]
      ?.split('\n      - name:')[0];
    const proofScript = proofStep
      ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
      .replace(/^ {10}/gm, '');
    const collectStep = workflow
      .split('      - name: Collect first-load JS manifest\n')[1]
      ?.split('\n      - name:')[0];
    const collectScript = collectStep
      ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
      .replace(/^ {10}/gm, '');
    const result = runScript(
      [script, collectScript, proofScript].join('\n'),
      'app',
      false,
      true,
      true,
    );
    expect(result.status).toBe(23);
    expect(result.calls).toHaveLength(13);
    expect(result.proofFiles).toEqual([
      'request-serializers-0.json',
      'request-serializers-1.json',
      'request-serializers-2.json',
      'request-serializers-3.json',
      'request-serializers-build.json',
      'request-serializers-initial.json',
      'request-serializers-input.json',
      'request-serializers-package.json',
    ]);
    expect(proofStep).toContain('id: serializer_proof');
    expect(proofStep).not.toContain('continue-on-error');
    expect(workflow).toContain(
      "!cancelled() && (steps.serializer_proof.outcome == 'success' || steps.serializer_proof.outcome == 'failure')",
    );
  });

  it('restores and retains the exact master cache before a failing serializer proof', () => {
    const restoreIndex = workflow.indexOf('      - name: Restore baseline\n');
    const retainIndex = workflow.indexOf(
      '      - name: Retain serializer comparison baseline\n',
    );
    const proofIndex = workflow.indexOf(
      '      - name: Verify deferred request serializers\n',
    );
    expect(restoreIndex).toBeGreaterThan(0);
    expect(restoreIndex).toBeLessThan(retainIndex);
    expect(retainIndex).toBeLessThan(proofIndex);
    const restoreStep = workflow
      .split('      - name: Restore baseline\n')[1]
      ?.split('\n      - name:')[0];
    expect(restoreStep).toContain('id: baseline_cache');
    expect(restoreStep).toContain('restore-keys:');
    const result = runBaselineReceipt(
      `bundle-baseline-app-${'a'.repeat(40)}`,
      true,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.retained).toBe(result.baseline);
    expect(result.receipt).toEqual({
      schemaVersion: 1,
      app: 'app',
      sourceSha: 'b'.repeat(40),
      baseSha: 'a'.repeat(40),
      requestedCacheKey: `bundle-baseline-app-${'a'.repeat(40)}`,
      matchedCacheKey: `bundle-baseline-app-${'a'.repeat(40)}`,
      exactCacheHit: true,
      baselineAvailable: true,
      eligibleForSameBaseComparison: true,
    });
  });

  it('retains fallback evidence without labeling it a fair same-base comparison', () => {
    const result = runBaselineReceipt(
      `bundle-baseline-app-${'c'.repeat(40)}`,
      false,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.retained).toBe(result.baseline);
    expect(result.receipt).toMatchObject({
      matchedCacheKey: `bundle-baseline-app-${'c'.repeat(40)}`,
      exactCacheHit: false,
      baselineAvailable: true,
      eligibleForSameBaseComparison: false,
    });
    const mismatchedHit = runBaselineReceipt(
      `bundle-baseline-app-${'c'.repeat(40)}`,
      true,
    );
    expect(mismatchedHit.status, mismatchedHit.stderr).toBe(0);
    expect(mismatchedHit.receipt).toMatchObject({
      eligibleForSameBaseComparison: false,
    });
  });

  it('records an unavailable baseline without fabricating a fair comparison or blocking absolute reports', () => {
    const result = runBaselineReceipt('', false, false);
    expect(result.status, result.stderr).toBe(0);
    expect(result.retained).toBeNull();
    expect(result.receipt).toMatchObject({
      matchedCacheKey: '',
      exactCacheHit: false,
      baselineAvailable: false,
      eligibleForSameBaseComparison: false,
    });
    const missingExact = runBaselineReceipt(
      `bundle-baseline-app-${'a'.repeat(40)}`,
      true,
      false,
    );
    expect(missingExact.status, missingExact.stderr).toBe(0);
    expect(missingExact.receipt).toMatchObject({
      exactCacheHit: true,
      baselineAvailable: false,
      eligibleForSameBaseComparison: false,
    });
  });

  it('keeps graph diagnostics and a failing conclusion when actual compiler input cannot be authenticated', () => {
    const proofStep = workflow
      .split('      - name: Verify deferred request serializers\n')[1]
      ?.split('\n      - name:')[0];
    const proofScript = proofStep
      ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
      .replace(/^ {10}/gm, '');
    const result = runScript(
      proofScript,
      'app',
      false,
      true,
      false,
      false,
      true,
    );
    expect(result.status).toBe(29);
    expect(result.calls).toHaveLength(9);
    expect(result.proofFiles).toContain('request-serializers-input.json');
    expect(buildStep).toContain(
      'GENFEED_REQUEST_SERIALIZER_PROOF=1 NODE_OPTIONS=',
    );
    const config = readFileSync(
      path.join(root, 'apps/app/next.config.ts'),
      'utf8',
    );
    const rule = config
      .split("process.env.GENFEED_REQUEST_SERIALIZER_PROOF === '1'")[1]
      ?.split('root: path.resolve(appDir')[0];
    expect(rule).toContain("condition: { all: ['browser', 'production'] }");
    expect(rule).toContain(
      "'packages/serializers/dist/request-runtime.bundle.js'",
    );
    expect(rule).not.toMatch(/\bas\s*:/);
  });

  it('uploads only the known proof JSON glob from its hidden evidence directory', () => {
    const uploadStep = workflow
      .split('      - name: Upload request serializer proof\n')[1]
      ?.split('\n      - name:')[0];
    expect(uploadStep).toContain(
      'path: .bundle-size/request-serializers-*.json',
    );
    expect(uploadStep).toContain('include-hidden-files: true');
    expect(uploadStep).toContain('if-no-files-found: error');
    expect(uploadStep).toContain('retention-days: 1');
  });

  it('does not compile the app when production provenance collection fails', () => {
    const result = runScript(script, 'app', false, false, false, true);
    expect(result.status).toBe(19);
    expect(result.calls).toHaveLength(2);
    expect(result.calls).not.toContainEqual({
      bin: 'bun',
      args: ['run', '--cwd', 'apps/app', 'analyze'],
    });
  });

  it('collects all-route actual filename evidence before strict proof while preserving the website collector', () => {
    const collectStep = workflow
      .split('      - name: Collect first-load JS manifest\n')[1]
      ?.split('\n      - name:')[0];
    const collectScript = collectStep
      ?.match(/ {8}run: \|\n((?: {10}[^\n]*(?:\n|$))+)/)?.[1]
      .replace(/^ {10}/gm, '');
    expect(
      workflow.indexOf('      - name: Collect first-load JS manifest\n'),
    ).toBeLessThan(
      workflow.indexOf('      - name: Verify deferred request serializers\n'),
    );
    expect(collectStep).toContain(`BUNDLE_APP: ${matrixApp}`);
    expect(runScript(collectScript, 'app', false, true)).toEqual({
      status: 0,
      calls: [
        {
          bin: 'bun',
          args: [
            'run',
            'scripts/collect-bundle-manifest.ts',
            '--app',
            'app',
            '--dist',
            'apps/app/.next',
            '--out',
            '.bundle-size/head.json',
            '--include-chunks',
          ],
        },
      ],
    });
    expect(runScript(collectScript, 'website', false, true)).toEqual({
      status: 0,
      calls: [
        {
          bin: 'bun',
          args: [
            'run',
            'scripts/collect-bundle-manifest.ts',
            '--app',
            'website',
            '--dist',
            'apps/website/.next',
            '--out',
            '.bundle-size/head.json',
          ],
        },
      ],
    });
    expect(collectStep).toContain(
      'cp .bundle-size/head.json .bundle-size/request-serializers-initial.json',
    );
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
      '        if: $' +
        "{{ !cancelled() && (steps.serializer_proof.outcome == 'success' || steps.serializer_proof.outcome == 'failure') && matrix.app == 'app' && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}",
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
