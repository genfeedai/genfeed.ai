import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const entrypoint = readFileSync(
  fileURLToPath(
    new URL('../../../../../docker/selfhosted-entrypoint.sh', import.meta.url),
  ),
  'utf8',
).split('# Start NestJS services')[0];

describe('self-hosted reference sync bootstrap', () => {
  it.each([undefined, '3000'])(
    'passes the API port to sync when the parent PORT is %s',
    (parentPort) => {
      const root = mkdtempSync(join(tmpdir(), 'reference-sync-port-'));
      const bin = join(root, 'bin');
      const trace = join(root, 'sync-port');
      mkdirSync(bin);
      mkdirSync(join(root, 'packages/prisma'), { recursive: true });
      for (const command of ['bun', 'redis-server', 'node']) {
        const path = join(bin, command);
        writeFileSync(
          path,
          command === 'node'
            ? '#!/bin/bash\nprintf "%s" "$PORT" > "$SYNC_PORT_TRACE"\n'
            : '#!/bin/bash\nexit 0\n',
        );
        chmodSync(path, 0o755);
      }

      try {
        const result = spawnSync('bash', ['-c', entrypoint], {
          cwd: root,
          env: {
            BETTER_AUTH_ENABLED: 'false',
            GENFEEDAI_API_URL: 'http://localhost:4567',
            NODE_ENV: 'test',
            PATH: `${bin}:${process.env.PATH}`,
            ...(parentPort ? { PORT: parentPort } : {}),
            SYNC_PORT_TRACE: trace,
            TOKEN_ENCRYPTION_KEY: 'test-entrypoint-key',
          },
          timeout: 5_000,
        });
        expect(result.status, result.stderr?.toString()).toBe(0);
        expect(readFileSync(trace, 'utf8')).toBe('4567');
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
  );
});

describe('self-hosted auth defaults', () => {
  function runEntrypoint(
    env: Record<string, string>,
  ): Record<string, string> | null {
    const root = mkdtempSync(join(tmpdir(), 'entrypoint-auth-'));
    const bin = join(root, 'bin');
    const trace = join(root, 'auth-env');
    mkdirSync(bin);
    mkdirSync(join(root, 'packages/prisma'), { recursive: true });
    for (const command of ['bun', 'redis-server', 'node']) {
      const path = join(bin, command);
      writeFileSync(
        path,
        command === 'node'
          ? '#!/bin/bash\nprintf "%s|%s|%s" "$BETTER_AUTH_ENABLED" "$NEXT_PUBLIC_BETTER_AUTH_ENABLED" "$BETTER_AUTH_URL" > "$AUTH_ENV_TRACE"\n'
          : '#!/bin/bash\nexit 0\n',
      );
      chmodSync(path, 0o755);
    }

    try {
      const result = spawnSync('bash', ['-c', entrypoint], {
        cwd: root,
        env: {
          AUTH_ENV_TRACE: trace,
          BETTER_AUTH_SECRET: 'test-better-auth-secret',
          GENFEEDAI_API_URL: 'http://localhost:4567',
          NODE_ENV: 'test',
          PATH: `${bin}:${process.env.PATH}`,
          TOKEN_ENCRYPTION_KEY: 'test-entrypoint-key',
          ...env,
        },
        timeout: 5_000,
      });
      expect(result.status, result.stderr?.toString()).toBe(0);
      const [enabled, publicEnabled, url] = readFileSync(trace, 'utf8').split(
        '|',
      );

      return { enabled, publicEnabled, url };
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  }

  it('enables sign-up when no auth flags are set', () => {
    expect(runEntrypoint({})).toEqual({
      enabled: 'true',
      publicEnabled: 'true',
      url: 'http://localhost:4567',
    });
  });

  it('keeps the login wall off when BETTER_AUTH_ENABLED=false', () => {
    expect(runEntrypoint({ BETTER_AUTH_ENABLED: 'false' })).toEqual({
      enabled: 'false',
      publicEnabled: 'false',
      url: '',
    });
  });
});
