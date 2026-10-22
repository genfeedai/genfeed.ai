import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
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

test('bundle PR execution belongs to CI while master and manual keep their entrypoint', () => {
  const entrypoint = read('.github/workflows/bundle-size.yml');
  assert.doesNotMatch(entrypoint, /^ {2}pull_request:/m);
  assert.match(entrypoint, /^ {2}push:\n {4}branches: \[master\]/m);
  assert.match(entrypoint, /^ {2}workflow_dispatch:/m);
  assert.match(entrypoint, /uses: \.\/\.github\/workflows\/_bundle-size\.yml/);
  const ci = read('.github/workflows/ci.yml');
  const bundle = ci.match(/^ {2}bundle-size:\n((?: {4}.*(?:\n|$)|\n)+)/m)?.[1];
  assert.ok(bundle, 'CI must call the bundle graph');
  assert.match(bundle, /uses: \.\/\.github\/workflows\/_bundle-size\.yml/);
  assert.doesNotMatch(
    bundle,
    /needs:/,
    'bundle scope is independent of the CI trust/test planner',
  );
});

test('frontend measurements and comments use the same affected consumers', () => {
  const bundle = read('.github/workflows/_bundle-size.yml');
  assert.match(bundle, /uses: \.\/\.github\/actions\/detect-frontend-scope/);
  assert.equal(
    bundle.match(/app: \$\{\{ fromJSON\(needs.detect.outputs.apps\) \}\}/g)
      ?.length,
    2,
  );
  const links = read('.github/actions/detect-link-check-scope/action.yml');
  assert.match(links, /value: \$\{\{ steps.frontends.outputs.website \}\}/);
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

test('link checks run inside direct CI independently of the trust planner', () => {
  const manual = read('.github/workflows/link-check.yml');
  assert.doesNotMatch(manual, /^ {2}pull_request:/m);
  assert.doesNotMatch(manual, /^ {2}push:/m);
  const ci = read('.github/workflows/ci.yml');
  const detect = ci.match(
    /^ {2}link-check-detect:\n((?: {4}.*(?:\n|$)|\n)+)/m,
  )?.[1];
  assert.ok(detect, 'CI must route Link Check independently');
  assert.doesNotMatch(detect, /needs:/);
  assert.match(detect, /inputs.run_heavy_tests != true/);
});

const { parse: parseYaml } = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
)('yaml');
const readAction = (name) =>
  parseYaml(read(`.github/actions/${name}/action.yml`));

test('website link workload preserves ordered hard failures and advisory SEO inputs', () => {
  const action = readAction('check-website-links');
  assert.equal(action.runs.using, 'composite');
  assert.deepEqual(
    action.runs.steps.map((step) => step.name),
    [
      'Setup Bun environment',
      'Build website',
      'Start website',
      'Check internal links + orphan pages',
      'Audit on-page SEO',
      'Stop website',
    ],
  );
  assert.deepEqual(action.runs.steps[0], {
    name: 'Setup Bun environment',
    uses: './.github/actions/setup-bun-env',
  });
  const [build, start, crawl, seo, stop] = action.runs.steps.slice(1);
  assert.equal(build.run, 'bunx turbo run build --filter=@genfeedai/website');
  assert.deepEqual(build.env, { GITHUB_TOKEN: '${{ github.token }}' });
  assert.equal(crawl.run, 'cd apps/website && bun run check:orphans');
  assert.deepEqual(crawl.env, { BASE_URL: 'http://localhost:3000' });
  assert.equal(seo.run, 'cd apps/website && bun run check:seo');
  assert.deepEqual(seo.env, {
    BASE_URL: 'http://localhost:3000',
    SEO_SOFT: '1',
  });
  assert.equal(stop.if, 'always()');
  assert.equal(stop.run, 'kill "$SERVER_PID" 2>/dev/null || true');
  assert.match(start.run, /seq 1 60/);
  for (const step of action.runs.steps.slice(1)) {
    assert.equal(step.shell, 'bash');
    assert.equal(step['continue-on-error'], undefined);
  }
});

test('docs link workload preserves lychee inputs and explicit token boundary', () => {
  const action = readAction('check-docs-links');
  assert.equal(action.inputs['github-token'].required, true);
  assert.equal(action.runs.using, 'composite');
  assert.equal(action.runs.steps.length, 1);
  const step = action.runs.steps[0];
  assert.equal(
    step.uses,
    'lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8',
  );
  assert.deepEqual(step.with, {
    args: "--config lychee.toml --remap 'https://github.com/genfeedai/genfeed.ai/blob/master file://${{ github.workspace }}' 'apps/docs/content/**/*.md' 'apps/docs/content/**/*.mdx' 'README.md' 'apps/website/README.md'",
    fail: true,
  });
  assert.deepEqual(step.env, { GITHUB_TOKEN: '${{ inputs.github-token }}' });
});

function websiteFixture(t, { readyAt = 1, fail = '' } = {}) {
  const temp = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'website-links-')),
  );
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  mkdirSync(path.join(temp, 'apps/website'), { recursive: true });
  const bin = path.join(temp, 'bin');
  mkdirSync(bin);
  const shim = (name, body) =>
    writeFileSync(
      path.join(bin, name),
      `#!/bin/bash
${body}
`,
      { mode: 0o755 },
    );
  shim(
    'bunx',
    'echo "build|$*|$PWD|$GITHUB_TOKEN" >> "$CALL_LOG"; [ "$FAIL" != build ]',
  );
  shim(
    'bun',
    `echo "$2|$PWD|\${PORT:-}|\${BASE_URL:-}|\${SEO_SOFT:-}" >> "$CALL_LOG"
if [ "$2" = start ]; then touch "$STARTED"; fi
[ "$FAIL" != "$2" ]`,
  );
  shim(
    'curl',
    `for _ in $(seq 1 1000); do [ -f "$STARTED" ] && break; done
n=0; [ ! -f "$ATTEMPTS" ] || read -r n < "$ATTEMPTS"
echo "$((n+1))" > "$ATTEMPTS"
echo "curl|$*" >> "$CALL_LOG"
[ "$((n+1))" -ge "$READY_AT" ]`,
  );
  shim('sleep', 'echo "sleep|$*" >> "$CALL_LOG"');
  const envFile = path.join(temp, 'env');
  writeFileSync(envFile, '');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CALL_LOG: path.join(temp, 'calls'),
    STARTED: path.join(temp, 'started'),
    ATTEMPTS: path.join(temp, 'attempts'),
    READY_AT: String(readyAt),
    FAIL: fail,
    PORT: '',
    BASE_URL: '',
    SEO_SOFT: '',
    GITHUB_ENV: envFile,
    GITHUB_TOKEN: 'synthetic-read-only',
  };
  const steps = readAction('check-website-links').runs.steps.slice(1);
  const results = [];
  let failed = false;
  for (const step of steps) {
    if (failed && step.if !== 'always()') continue;
    const isCleanup = step.if === 'always()';
    const script = isCleanup
      ? `kill() { echo "kill|$*" >> "$CALL_LOG"; return 1; }; ${step.run}`
      : step.run;
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
      {
        cwd: temp,
        encoding: 'utf8',
        timeout: 5000,
        env: { ...env, ...step.env, GITHUB_TOKEN: 'synthetic-read-only' },
      },
    );
    assert.equal(result.error, undefined, step.name);
    results.push({ name: step.name, ...result });
    if (result.status !== 0) failed = true;
    const pid = readFileSync(envFile, 'utf8').match(/^SERVER_PID=(\d+)$/m)?.[1];
    if (pid) env.SERVER_PID = pid;
  }
  return {
    results,
    log: readFileSync(env.CALL_LOG, 'utf8').trim().split('\n'),
    exported: readFileSync(envFile, 'utf8'),
    temp,
  };
}

test('website scripts execute build, readiness, crawl, SEO and cleanup with original inputs', (t) => {
  for (const readyAt of [1, 4]) {
    const fixture = websiteFixture(t, { readyAt });
    assert.ok(fixture.results.every((result) => result.status === 0));
    assert.match(fixture.exported, /^SERVER_PID=\d+\n$/);
    assert.deepEqual(
      fixture.log.filter((line) => !/^(curl|sleep)\|/.test(line)),
      [
        `build|turbo run build --filter=@genfeedai/website|${fixture.temp}|synthetic-read-only`,
        `start|${fixture.temp}/apps/website|3000||`,
        `check:orphans|${fixture.temp}/apps/website||http://localhost:3000|`,
        `check:seo|${fixture.temp}/apps/website||http://localhost:3000|1`,
        `kill|${fixture.exported.trim().split('=')[1]}`,
      ],
    );
    assert.deepEqual(
      fixture.log.filter((line) => line.startsWith('curl|')),
      Array(readyAt).fill('curl|-fsS http://localhost:3000/'),
    );
    assert.deepEqual(
      fixture.log.filter((line) => line.startsWith('sleep|')),
      Array(readyAt - 1).fill('sleep|2'),
    );
  }
});

test('website readiness times out after sixty attempts and still cleans up', (t) => {
  const fixture = websiteFixture(t, { readyAt: 61 });
  const start = fixture.results.find(
    (result) => result.name === 'Start website',
  );
  assert.equal(start.status, 1);
  assert.match(
    start.stdout,
    /::error::Website did not become ready on :3000 within 120s/,
  );
  assert.equal(
    fixture.log.filter((line) => line.startsWith('curl|')).length,
    60,
  );
  assert.equal(fixture.log.filter((line) => line === 'sleep|2').length, 60);
  assert.ok(!fixture.log.some((line) => /^check:/.test(line)));
  assert.match(fixture.log.at(-1), /^kill\|\d+$/);
  assert.equal(fixture.results.at(-1).status, 0);
});

test('website build, crawl and SEO failures propagate and cleanup tolerates missing or stale PID', (t) => {
  for (const fail of ['build', 'check:orphans', 'check:seo']) {
    const fixture = websiteFixture(t, { fail });
    assert.equal(
      fixture.results.filter((result) => result.status !== 0).length,
      1,
    );
    if (fail === 'build')
      assert.ok(!fixture.log.some((line) => /^start\||^check:/.test(line)));
    if (fail === 'check:orphans')
      assert.ok(!fixture.log.some((line) => /^check:seo\|/.test(line)));
    if (fail === 'check:seo')
      assert.ok(fixture.log.some((line) => /check:seo\|.*\|1$/.test(line)));
    assert.equal(fixture.results.at(-1).name, 'Stop website');
    assert.equal(fixture.results.at(-1).status, 0);
    assert.match(fixture.log.at(-1), /^kill\|/);
  }
});

test('shared link scope retains original filters and validates relocated routing inputs', () => {
  const action = readAction('detect-link-check-scope');
  assert.equal(action.inputs, undefined);
  assert.deepEqual(action.outputs, {
    website: {
      description: 'Whether website checks are selected',
      value: '${{ steps.frontends.outputs.website }}',
    },
    docs: {
      description: 'Whether Markdown checks are selected',
      value: '${{ steps.changes.outputs.docs }}',
    },
  });
  assert.equal(action.runs.using, 'composite');
  assert.deepEqual(action.runs.steps[0], {
    id: 'frontends',
    uses: './.github/actions/detect-frontend-scope',
  });
  const changes = action.runs.steps[1];
  assert.equal(action.runs.steps.length, 2);
  assert.equal(
    changes.uses,
    'dorny/paths-filter@ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d',
  );
  assert.deepEqual(parseYaml(changes.with.filters), {
    docs: [
      'apps/docs/content/**',
      'lychee.toml',
      '.github/workflows/link-check.yml',
      '.github/workflows/ci.yml',
      '.github/actions/detect-link-check-scope/**',
      '.github/actions/check-website-links/**',
      '.github/actions/check-docs-links/**',
      '**/*.md',
      '**/*.mdx',
    ],
  });
  for (const [file, detectorId] of [
    ['ci.yml', 'link-check-detect'],
    ['link-check.yml', 'detect'],
  ]) {
    const workflow = parseYaml(read(`.github/workflows/${file}`));
    assert.deepEqual(workflow.jobs[detectorId].outputs, {
      website: '${{ steps.scope.outputs.website }}',
      docs: '${{ steps.scope.outputs.docs }}',
    });
    assert.deepEqual(workflow.jobs[detectorId].steps[1], {
      id: 'scope',
      uses: './.github/actions/detect-link-check-scope',
    });
    assert.deepEqual(workflow.jobs['website-links'].steps[1], {
      uses: './.github/actions/check-website-links',
    });
    assert.deepEqual(workflow.jobs['docs-links'].steps[1], {
      uses: './.github/actions/check-docs-links',
      with: { 'github-token': '${{ secrets.GITHUB_TOKEN }}' },
    });
    for (const id of [detectorId, 'website-links', 'docs-links']) {
      assert.equal(workflow.jobs[id].steps.length, 2);
    }
    assert.equal(workflow.env.TURBO_TEAM, '${{ vars.TURBO_TEAM }}');
    assert.equal(workflow.env.TURBO_TOKEN, '${{ secrets.TURBO_TOKEN }}');
    assert.equal(workflow.env.TZ, 'UTC');
  }
});
