import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveServerImage } from './resolve-server-image.mjs';

const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const repository = 'ghcr.io/example/repo/server';

test('reuses only an immutable digest whose image revision matches the source', () => {
  const calls = [];
  const result = resolveServerImage({
    repository,
    sha,
    execute(args) {
      calls.push(args);
      return {
        status: 0,
        stdout:
          calls.length === 1
            ? JSON.stringify(digest)
            : JSON.stringify({
                'linux/amd64': {
                  config: {
                    Labels: { 'org.opencontainers.image.revision': sha },
                  },
                },
              }),
      };
    },
  });
  assert.deepEqual(result, { exists: true, digest });
  assert.equal(calls[0][3], `${repository}:${sha}`);
  assert.equal(calls[1][3], `${repository}@${digest}`);
});

test('only a missing manifest permits a build fallback', () => {
  assert.deepEqual(
    resolveServerImage({
      repository,
      sha,
      execute: () => ({ status: 1, stderr: 'manifest unknown' }),
    }),
    { exists: false, digest: '' },
  );
  for (const stderr of [
    'unauthorized: access denied',
    'network timeout',
    'registry is unavailable',
    'lookup ghcr.io: host not found',
  ]) {
    assert.throws(
      () =>
        resolveServerImage({
          repository,
          sha,
          execute: () => ({ status: 1, stderr }),
        }),
      /inspect/,
    );
  }
});

test('rejects mutable refs, malformed digests and images from another commit', () => {
  assert.throws(
    () =>
      resolveServerImage({
        repository,
        sha: 'latest',
        execute: () => assert.fail(),
      }),
    /exact/,
  );
  assert.throws(
    () =>
      resolveServerImage({
        repository: 'untrusted/image',
        sha,
        execute: () => assert.fail(),
      }),
    /GHCR/,
  );
  assert.throws(
    () =>
      resolveServerImage({
        repository,
        sha,
        execute: () => ({ status: 0, stdout: '"latest"' }),
      }),
    /digest/,
  );
  let calls = 0;
  assert.throws(
    () =>
      resolveServerImage({
        repository,
        sha,
        execute: () => ({
          status: 0,
          stdout:
            ++calls === 1
              ? JSON.stringify(digest)
              : JSON.stringify({
                  config: {
                    Labels: {
                      'org.opencontainers.image.revision': 'c'.repeat(40),
                    },
                  },
                }),
        }),
      }),
    /revision/,
  );
});
