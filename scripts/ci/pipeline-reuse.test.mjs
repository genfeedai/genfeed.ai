import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;

function pullImage(t, overrides = {}) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pull-server-image-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  writeFileSync(
    path.join(temp, 'docker'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nif [ "$1" = "image" ]; then printf "%s\\n" "$IMAGE_REVISION"; fi\n',
    { mode: 0o755 },
  );
  const result = spawnSync(
    'bash',
    [path.join(root, 'scripts/ci/pull-server-image.sh')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${temp}:${process.env.PATH}`,
        CALL_LOG: path.join(temp, 'calls'),
        IMAGE_REVISION: sha,
        SOURCE_SHA: sha,
        SERVER_IMAGE_DIGEST: digest,
        GITHUB_REPOSITORY: 'Genfeedai/Genfeed.ai',
        ...overrides,
      },
    },
  );
  let calls = '';
  try {
    calls = readFileSync(path.join(temp, 'calls'), 'utf8');
  } catch {}
  return { ...result, calls };
}

test('runtime and scanner share a published digest while retaining independent validation', () => {
  const builder = read('.github/workflows/build-server-image.yml');
  assert.doesNotMatch(
    builder,
    /^ {2}push:/m,
    'master builds run through Full Suite, not a second push workflow',
  );
  assert.match(
    builder,
    /image_digest:[\s\S]*?value: \$\{\{ jobs.build.outputs.image_digest \}\}/,
  );
  const composite = read('.github/actions/build-unified-image/action.yml');
  assert.match(
    composite,
    /run:[\s\S]*?node scripts\/ci\/resolve-server-image.mjs/,
  );
  assert.match(
    composite,
    /if: steps.existing.outputs.exists != 'true'[\s\S]*?uses: docker\/build-push-action@/,
  );
  assert.match(composite, /provenance: true\n {8}sbom: true/);
  for (const file of ['build-verify.yml', 'security-scan.yml']) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(
      workflow,
      /uses: \.\/\.github\/workflows\/build-server-image.yml/,
    );
    assert.match(
      workflow,
      /SERVER_IMAGE_DIGEST: \$\{\{ needs.server-image.outputs.image_digest \}\}/,
    );
    assert.match(workflow, /bash scripts\/ci\/pull-server-image.sh/);
    assert.doesNotMatch(
      workflow,
      /uses: docker\/build-push-action@|docker build /,
    );
  }
  const verify = read('.github/workflows/build-verify.yml');
  assert.match(verify, /needs: \[api-boot-check, server-image\]/);
  assert.match(
    verify,
    /for svc in api workers files mcp notifications telegram discord slack/,
  );
  assert.match(verify, /BOOT_CHECK/);
  assert.match(verify, /docker run/);
});

test('image consumers pull only the immutable digest and reject mismatched revisions', (t) => {
  const success = pullImage(t);
  assert.equal(success.status, 0, success.stderr);
  assert.match(
    success.calls,
    new RegExp(`^pull ghcr.io/genfeedai/genfeed.ai/server@${digest}`, 'm'),
  );
  assert.doesNotMatch(success.calls, /:latest|:master|:staging/);
  const mismatch = pullImage(t, { IMAGE_REVISION: 'c'.repeat(40) });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /revision does not match/);
  const invalid = pullImage(t, { SERVER_IMAGE_DIGEST: '' });
  assert.notEqual(invalid.status, 0);
  assert.equal(
    invalid.calls,
    '',
    'invalid references must fail before contacting Docker',
  );
});

test('Playwright tiers share build setup without enabling auth bypass for real sessions', () => {
  const action = read('.github/actions/setup-playwright-app/action.yml');
  assert.match(action, /cache-playwright: 'true'/);
  assert.match(
    action,
    /NEXT_PUBLIC_API_ENDPOINT: \$\{\{ inputs.api-endpoint \}\}/,
  );
  assert.match(action, /NEXT_PUBLIC_API_URL: \$\{\{ inputs.api-endpoint \}\}/);
  assert.match(action, /NEXT_PUBLIC_GENFEED_CLOUD: 'false'/);
  assert.match(action, /E2E_COVERAGE: '1'/);
  for (const file of [
    'e2e.yml',
    'coverage.yml',
    'playwright-full-nightly.yml',
  ]) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(workflow, /uses: \.\/\.github\/actions\/setup-playwright-app/);
    assert.doesNotMatch(workflow, /NEXT_PUBLIC_API_URL:/);
  }
  const authed = read('.github/workflows/e2e.yml')
    .split('  e2e-frontend-authed:')[1]
    .split('  nightly-failure-report:')[0];
  assert.match(authed, /test-mode: 'false'/);
  assert.match(authed, /api-endpoint: http:\/\/localhost:3010\/v1/);
});

test('frontend measurements and comments use the same affected consumers', () => {
  const bundle = read('.github/workflows/bundle-size.yml');
  assert.match(bundle, /uses: \.\/\.github\/actions\/detect-frontend-scope/);
  assert.equal(
    bundle.match(/app: \$\{\{ fromJSON\(needs.detect.outputs.apps\) \}\}/g)
      ?.length,
    2,
  );
  const links = read('.github/workflows/link-check.yml');
  assert.match(links, /website: \$\{\{ steps.frontends.outputs.website \}\}/);
  assert.match(links, /uses: \.\/\.github\/actions\/detect-frontend-scope/);
  assert.match(links, /docs:[\s\S]*?'\*\*\/\*\.mdx'/);
});

test('future delivery workflows default to validation and fail on missing artifacts', () => {
  const browser = read('.github/workflows/browser-extension-submit.yml');
  assert.match(browser, /submit:[\s\S]*?type: boolean\n {8}default: false/);
  assert.match(
    browser,
    /if: startsWith\(github.ref, 'refs\/tags\/extension-browser-v'\) && \(github.event_name == 'push' \|\| inputs.submit\)/,
  );
  assert.match(
    browser,
    /run: bunx turbo run build --force --filter=@genfeedai\/extension-browser/,
  );
  assert.match(browser, /if-no-files-found: error/);
  const mobile = read('.github/workflows/mobile-build.yml');
  assert.match(mobile, /build:[\s\S]*?type: boolean\n {8}default: false/);
  assert.match(mobile, /if: github.event_name == 'push' \|\| inputs.build/);
  assert.match(mobile, /uses: \.\/\.github\/actions\/setup-bun-env/);
  assert.match(mobile, /EXPO_PROJECT_ID: \$\{\{ vars.EXPO_PROJECT_ID \}\}/);
  assert.match(
    mobile,
    /profile \$\{\{ github.event.inputs.profile \|\| 'production' \}\}/,
  );
  const eas = JSON.parse(read('apps/mobile/app/eas.json'));
  assert.equal(eas._status, undefined);
  assert.equal(
    eas.submit,
    undefined,
    'no misleading placeholder store credentials',
  );
  assert.equal(eas.build.production.android.applicationId, undefined);
  assert.equal(eas.build.production.ios.bundleIdentifier, undefined);
});

test('builder normalizes one configured image identity before every registry use', (t) => {
  const composite = read('.github/actions/build-unified-image/action.yml');
  const step = composite
    .split('    - name: Normalize server image identity\n')[1]
    ?.split('    - name: Set up Docker Buildx')[0];
  assert.ok(step);
  const script = step
    .split('      run: |\n')[1]
    .split('\n')
    .map((line) => (line.startsWith('        ') ? line.slice(8) : line))
    .join('\n');
  const temp = mkdtempSync(path.join(os.tmpdir(), 'canonical-image-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const output = path.join(temp, 'outputs');
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      REGISTRY: 'GHCR.IO',
      IMAGE_PREFIX: 'Acme/Custom.Server',
      GITHUB_REPOSITORY: 'Different/Repository',
      GITHUB_OUTPUT: output,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(output, 'utf8'),
    'registry=ghcr.io\nrepository=ghcr.io/acme/custom.server/server\n',
  );
  for (const binding of [
    'registry: ${{ steps.image.outputs.registry }}',
    'SERVER_IMAGE_REPOSITORY: ${{ steps.image.outputs.repository }}',
    'images: ${{ steps.image.outputs.repository }}',
    'cache-from: type=registry,ref=${{ steps.image.outputs.repository }}:buildcache',
    'cache-to: type=registry,ref=${{ steps.image.outputs.repository }}:buildcache,mode=max',
    'IMAGE_REPOSITORY: ${{ steps.image.outputs.repository }}',
  ])
    assert.ok(composite.includes(binding), binding);
  assert.doesNotMatch(
    composite,
    /\$\{\{ inputs.registry \}\}\/|\$\{\{ github.repository \}\}/,
  );
  assert.match(composite, /node scripts\/ci\/resolve-server-image.mjs/);
});
