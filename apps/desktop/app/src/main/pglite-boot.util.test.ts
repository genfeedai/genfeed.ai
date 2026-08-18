import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootPGlite } from './pglite-boot.util';

describe('bootPGlite', () => {
  it(
    'boots a working instance without leaking the Emscripten exit code',
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'genfeed-pglite-boot-'),
      );

      try {
        const pglite = await bootPGlite({ dataDir });

        expect(process.exitCode ?? 0).toBe(0);

        const result = await pglite.query<{ ok: number }>('SELECT 1 AS ok');
        expect(result.rows).toEqual([{ ok: 1 }]);

        await pglite.close();
        expect(process.exitCode ?? 0).toBe(0);
      } finally {
        fs.rmSync(dataDir, { force: true, recursive: true });
      }
    },
    { timeout: 20_000 },
  );
});
