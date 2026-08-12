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

  it('repairs the legacy workspace shape without deleting rows', {
    timeout: 20_000,
  }, async () => {
    const legacyDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-pglite-legacy-'),
    );

    try {
      const legacy = new PGlite({ dataDir: legacyDataDir });
      await legacy.waitReady;
      await legacy.exec(`
        CREATE TABLE desktop_workspace (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          linked_project_id TEXT,
          file_index TEXT NOT NULL DEFAULT '[]',
          indexing_state TEXT NOT NULL DEFAULT 'idle',
          local_draft_count INTEGER NOT NULL DEFAULT 0,
          pending_sync_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_opened_at TEXT NOT NULL,
          linked_organization_id TEXT
        );
        INSERT INTO desktop_workspace (
          id, name, path, created_at, updated_at, last_opened_at
        ) VALUES (
          'legacy-workspace', 'Legacy workspace', '/tmp/legacy',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z'
        );
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
        await legacy.query(
          `INSERT INTO _prisma_migrations (
            id, migration_name, started_at, applied_steps_count
          ) VALUES ($1, $1, $2, 1)`,
          [migrationName, '2026-01-01T00:00:00.000Z'],
        );
      }
      await legacy.close();

      const service = new DesktopPgliteService(legacyDataDir);
      const repaired = await service.init();
      const columns = await repaired.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'desktop_workspace'`,
      );
      const workspaces = await repaired.query<{
        id: string;
        sync_policy: string;
      }>('SELECT id, sync_policy FROM desktop_workspace WHERE id = $1', [
        'legacy-workspace',
      ]);

      expect(columns.rows).toContainEqual({ column_name: 'linked_brand_id' });
      expect(columns.rows).toContainEqual({ column_name: 'sync_policy' });
      expect(workspaces.rows).toEqual([
        { id: 'legacy-workspace', sync_policy: 'local-only' },
      ]);
      await service.close();
    } finally {
      fs.rmSync(legacyDataDir, { force: true, recursive: true });
    }
  });
});
