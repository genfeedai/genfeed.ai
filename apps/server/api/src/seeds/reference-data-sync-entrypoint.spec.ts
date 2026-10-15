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
            GENFEEDAI_API_URL: 'http://localhost:4567',
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
