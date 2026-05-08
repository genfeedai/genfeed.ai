import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';

const { DesktopPgliteService } = await import('./pglite.service');

describe('DesktopPgliteService', () => {
  let temporaryRoot: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-desktop-pglite-'),
    );
    resetElectronMockState();
    electronMockState.app.userDataPath = temporaryRoot;
  });

  afterEach(() => {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  });

  it('runs fresh offline-sync migrations and accepts brand asset rows', async () => {
    const service = new DesktopPgliteService();

    try {
      const context = await service.getContext();
      const now = '2026-05-01T10:00:00.000Z';

      await context.db.query(
        `INSERT INTO desktop_organization (id, cloud_id, name, slug, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['desktop-local-org', 'org-cloud', 'Cloud Org', 'cloud-org', now, now],
      );
      await context.db.query(
        `INSERT INTO desktop_brand (id, organization_id, cloud_id, name, slug, sync_policy, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'brand-cloud',
          'desktop-local-org',
          'brand-cloud',
          'Cloud Brand',
          'cloud-brand',
          'metadata-sync',
          now,
          now,
        ],
      );
      await context.db.query(
        `INSERT INTO desktop_asset (
          id, organization_id, brand_id, cloud_id, cloud_object_key, local_path,
          sha256, size_bytes, mime_type, kind, origin, residency, upload_policy,
          original_file_name, display_name, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          'asset-local',
          'desktop-local-org',
          'brand-cloud',
          'asset-cloud',
          'ingredients/desktop-assets/org/hash/logo.png',
          '/workspace/.genfeed/assets/logo.png',
          'hash',
          128,
          'image/png',
          'image',
          'local-import',
          'synced',
          'full',
          'logo.png',
          'logo.png',
          now,
          now,
        ],
      );

      const rows = await context.db.query<{ id: string }>(
        `SELECT id FROM desktop_asset WHERE id = $1`,
        ['asset-local'],
      );

      expect(rows.rows).toEqual([{ id: 'asset-local' }]);
    } finally {
      await service.close();
    }
  });
});
