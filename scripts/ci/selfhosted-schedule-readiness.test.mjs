import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

function readinessScript(file) {
  const workflow = readFileSync(
    new URL(`../../.github/workflows/${file}`, import.meta.url),
    'utf8',
  );
  const step = workflow
    .split('- name: Readiness — platform schedules registered')[1]
    .split('\n      - name: ')[0];
  return step
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n')
    .replace('SECONDS + 120', 'SECONDS + 1')
    .replace('sleep 3', 'sleep 0.05');
}

/**
 * A `docker` stand-in for `docker compose ... exec -T genfeed redis-cli
 * ZSCORE bull:system-sweeps:repeat <scheduler>`: prints a score only for the
 * schedulers listed in REGISTERED, and an empty line (redis-cli's nil) for
 * the rest.
 */
function fakeDockerDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'fake-docker-'));
  const docker = path.join(directory, 'docker');
  writeFileSync(
    docker,
    [
      '#!/usr/bin/env bash',
      'for scheduler; do :; done',
      'for registered in $REGISTERED; do',
      '  if [ "$registered" = "$scheduler" ]; then echo 1760000000000; exit 0; fi',
      'done',
      'echo',
    ].join('\n'),
  );
  chmodSync(docker, 0o755);
  return directory;
}

for (const workflow of [
  'build-verify-selfhosted.yml',
  'e2e-selfhosted-release.yml',
]) {
  for (const [name, registered, expected] of [
    [
      'accepts a boot that registered hired agents and scheduled publishing',
      'platform:proactive-agent-strategies platform:posts-publish',
      0,
    ],
    [
      'rejects a boot with no hired-agent schedule',
      'platform:posts-publish',
      1,
    ],
    [
      'rejects a boot with no scheduled-publishing schedule',
      'platform:proactive-agent-strategies',
      1,
    ],
    ['rejects a boot that registered no schedules', '', 1],
  ]) {
    test(`${workflow}: ${name}`, async () => {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(
          'bash',
          ['-euo', 'pipefail', '-c', readinessScript(workflow)],
          {
            env: {
              ...process.env,
              COMPOSE_ENV_FILE: '.env',
              COMPOSE_FILE: 'compose.yml',
              PATH: `${fakeDockerDirectory()}:${process.env.PATH}`,
              REGISTERED: registered,
            },
            stdio: 'ignore',
          },
        );
        child.on('error', reject);
        child.on('exit', resolve);
      });
      assert.equal(code, expected);
    });
  }
}
