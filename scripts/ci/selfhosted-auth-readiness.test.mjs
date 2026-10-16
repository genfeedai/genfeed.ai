import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

function readinessScript(file) {
  const workflow = readFileSync(
    new URL(`../../.github/workflows/${file}`, import.meta.url),
    'utf8',
  );
  const step = workflow
    .split('- name: Readiness — stage 2')[1]
    .split('- name: Setup Bun environment')[0];
  return step
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n')
    .replace('SECONDS + 180', 'SECONDS + 1')
    .replace('sleep 3', 'sleep 0.05');
}

for (const workflow of [
  'build-verify-selfhosted.yml',
  'e2e-selfhosted-release.yml',
]) {
  for (const [name, sessionStatus, sessionBody, bootstrapStatus, expected] of [
    [
      'accepts a healthy auth handler with protected bootstrap',
      200,
      null,
      401,
      0,
    ],
    ['rejects tokenless access to the seeded workspace', 200, null, 200, 1],
    ['rejects an unavailable auth handler', 503, null, 401, 1],
    ['rejects a malformed anonymous session response', 200, {}, 401, 1],
  ]) {
    test(`${workflow}: ${name}`, async () => {
      const server = createServer((request, response) => {
        const session = request.url.endsWith('/get-session');
        response.writeHead(session ? sessionStatus : bootstrapStatus, {
          'content-type': 'application/json',
        });
        response.end(
          JSON.stringify(session ? sessionBody : { message: 'Unauthorized' }),
        );
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = server.address();
        const code = await new Promise((resolve, reject) => {
          const child = spawn(
            'bash',
            ['-euo', 'pipefail', '-c', readinessScript(workflow)],
            {
              env: { ...process.env, API_BASE_URL: `http://127.0.0.1:${port}` },
              stdio: 'ignore',
            },
          );
          child.on('error', reject);
          child.on('exit', resolve);
        });
        assert.equal(code, expected);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  }
}
