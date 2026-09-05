import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL(
    '../../.github/workflows/_deploy-hosted-saas-core.yml',
    import.meta.url,
  ),
  'utf8',
);
const step = workflow
  .split('      - name: Boot API and workers before services roll')[1]
  .split('      - name:')[0];
const script = step
  .split('        run: |\n')[1]
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');

for (const [api, worker] of [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
]) {
  test(`parallel boot checks await both results (${api}, ${worker})`, (t) => {
    const fixture = mkdtempSync(join(tmpdir(), 'boot-smoke-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    const stubs = `
      tofu() { echo fixture; }
      jq() { cat; }
      bun() {
        local phase other
        while [ "$#" -gt 0 ]; do
          if [ "$1" = --phase ]; then phase="$2"; break; fi
          shift
        done
        other=boot-smoke
        [ "$phase" != boot-smoke ] || other=worker-boot-smoke
        touch "$FIXTURE/$phase.started"
        for attempt in {1..100}; do
          [ ! -f "$FIXTURE/$other.started" ] || break
          sleep 0.01
        done
        [ -f "$FIXTURE/$other.started" ] || return 9
        echo "$phase" >> "$FIXTURE/completed"
        if [ "$phase" = boot-smoke ]; then return "$API_RESULT"; fi
        return "$WORKER_RESULT"
      }
    `;
    const result = spawnSync('bash', ['-c', stubs + script], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        FIXTURE: fixture,
        GITHUB_WORKSPACE: fixture,
        API_RESULT: String(api),
        WORKER_RESULT: String(worker),
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, api || worker ? 1 : 0, result.stderr);
    assert.deepEqual(
      readFileSync(join(fixture, 'completed'), 'utf8')
        .trim()
        .split('\n')
        .sort(),
      ['boot-smoke', 'worker-boot-smoke'],
    );
  });
}
