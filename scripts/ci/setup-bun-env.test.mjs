import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const action = readFileSync(
  fileURLToPath(
    new URL('../../.github/actions/setup-bun-env/action.yml', import.meta.url),
  ),
  'utf8',
);
const executableAction = action
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');
const bunVersion = readFileSync(
  fileURLToPath(new URL('../../.bun-version', import.meta.url)),
  'utf8',
).trim();
const workflowsDirectory = fileURLToPath(
  new URL('../../.github/workflows/', import.meta.url),
);
const dockerPolicies = [
  {
    file: 'docker/Dockerfile',
    source: readFileSync(
      fileURLToPath(new URL('../../docker/Dockerfile', import.meta.url)),
      'utf8',
    ),
  },
  {
    file: 'docker/Dockerfile.selfhosted',
    source: readFileSync(
      fileURLToPath(
        new URL('../../docker/Dockerfile.selfhosted', import.meta.url),
      ),
      'utf8',
    ),
  },
  {
    file: 'docker/Dockerfile.server',
    source: readFileSync(
      fileURLToPath(new URL('../../docker/Dockerfile.server', import.meta.url)),
      'utf8',
    ),
  },
];

test('centralizes the rolling Bun version without workflow overrides', () => {
  assert.equal(bunVersion, 'latest');
  assert.match(action, /bun-version-file: \.bun-version/);
  assert.doesNotMatch(action, /inputs\.bun-version/);
  assert.doesNotMatch(executableAction, /^\s*bun-version:/m);

  for (const workflowName of readdirSync(workflowsDirectory)) {
    if (!workflowName.endsWith('.yml') && !workflowName.endsWith('.yaml')) {
      continue;
    }

    const workflow = readFileSync(
      `${workflowsDirectory}/${workflowName}`,
      'utf8',
    );
    assert.doesNotMatch(
      workflow,
      /^\s*bun-version:/m,
      `${workflowName} must use the repository Bun policy`,
    );
  }
});

test('keeps Docker Bun resolution aligned with the rolling policy', () => {
  assert.equal(bunVersion, 'latest');
  assert.match(dockerPolicies[0].source, /^FROM oven\/bun:latest AS base$/m);

  for (const { file, source } of dockerPolicies.slice(1)) {
    assert.match(source, /https:\/\/bun\.sh\/install \| bash/);
    assert.doesNotMatch(
      source,
      /bun\.sh\/install \| bash -s ["']?bun-v/,
      `${file} must follow the rolling Bun installer policy`,
    );
  }
});

test('keeps the shared Bun setup action free of runner package installs', () => {
  assert.doesNotMatch(executableAction, /\bapt-get\b/);
  assert.doesNotMatch(executableAction, /\binstall-deps\b/);
  assert.doesNotMatch(executableAction, /playwright install --with-deps/);
});

test('skips ffmpeg-static downloads with an existing failing executable on the runner', () => {
  const setup = action.split(
    'name: Disable ffmpeg-static binary download in CI',
  )[1];
  const script = setup.match(/run: \|\n((?: {8}[^\n]*\n)+)/)?.[1];
  assert.ok(script);
  const output = execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ENV: '/dev/stdout' },
  });
  const executable = output.trim().split('FFMPEG_BIN=')[1];
  assert.ok(executable?.startsWith('/'));
  assert.ok(existsSync(executable));
  assert.equal(spawnSync(executable).status, 1);
});

test('downloads only the Playwright browser when its cache is cold', () => {
  assert.match(
    action,
    /if: \$\{\{ inputs\.cache-playwright == 'true' && steps\.playwright-cache\.outputs\.cache-hit != 'true' \}\}[\s\S]*?run: npx playwright install chromium/,
  );
});
