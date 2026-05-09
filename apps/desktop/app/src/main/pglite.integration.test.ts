import { afterAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopPgliteService } from './pglite.service';

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'genfeed-pglite-integration-'),
);

afterAll(() => {
  fs.rmSync(dataDir, { force: true, recursive: true });
});

describe('DesktopPgliteService integration', () => {
  it('persists data across restart when using an on-disk dataDir', {
    timeout: 20_000,
  }, async () => {
    const first = new DesktopPgliteService(dataDir);
    const firstDb = await first.init();

    await firstDb.exec(`
      INSERT INTO desktop_kv (key, value)
      VALUES ('persisted-key', 'persisted-value')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);
    await first.close();

    const second = new DesktopPgliteService(dataDir);
    const secondDb = await second.init();
    const rows = await secondDb.query<{ value: string }>(
      "SELECT value FROM desktop_kv WHERE key = 'persisted-key'",
    );

    expect(rows.rows).toEqual([{ value: 'persisted-value' }]);
    await second.close();
  });
});
