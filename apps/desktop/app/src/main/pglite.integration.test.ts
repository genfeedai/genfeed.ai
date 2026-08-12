import { afterAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
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

  it('discards an unsupported pre-release database before creating the supported baseline', {
    timeout: 20_000,
  }, async () => {
    const unsupportedDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-pglite-unsupported-'),
    );

    try {
      const unsupported = new PGlite({ dataDir: unsupportedDataDir });
      await unsupported.waitReady;
      await unsupported.exec(`
        CREATE TABLE pre_release_data (value TEXT NOT NULL);
        INSERT INTO pre_release_data (value) VALUES ('discard-me');
        CREATE TABLE _prisma_migrations (
          id TEXT PRIMARY KEY,
          checksum TEXT,
          finished_at TEXT,
          migration_name TEXT NOT NULL,
          logs TEXT,
          rolled_back_at TEXT,
          started_at TEXT NOT NULL,
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
      `);

      for (const migrationName of [
        '0001_init',
        '0002_local_cloud_identity',
        '0003_normalize_user_auth_provider_column',
        '0004_desktop_asset_is_deleted',
      ]) {
        await unsupported.query(
          `INSERT INTO _prisma_migrations (
            id, migration_name, started_at, applied_steps_count
          ) VALUES ($1, $1, $2, 1)`,
          [migrationName, '2026-01-01T00:00:00.000Z'],
        );
      }
      await unsupported.close();

      const service = new DesktopPgliteService(unsupportedDataDir);
      const current = await service.init();
      const discardedTables = await current.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'pre_release_data'`,
      );
      const baseline = await current.query<{ baseline_version: number }>(
        `SELECT baseline_version
         FROM desktop_schema_metadata
         WHERE singleton_key = 'current'`,
      );

      expect(service.didResetUnsupportedDatabase()).toBe(true);
      expect(discardedTables.rows).toEqual([]);
      expect(baseline.rows).toEqual([{ baseline_version: 1 }]);
      await service.close();
    } finally {
      fs.rmSync(unsupportedDataDir, { force: true, recursive: true });
    }
  });
});
