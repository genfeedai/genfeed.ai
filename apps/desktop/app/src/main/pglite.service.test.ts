import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopPgliteService } from './pglite.service';
import { DesktopPrismaService } from './prisma.service';

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();

    if (target) {
      fs.rmSync(target, { force: true, recursive: true });
    }
  }
});

describe('DesktopPgliteService', () => {
  it('initializes PGlite and applies Prisma migrations', {
    timeout: 20_000,
  }, async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-pglite-'));
    cleanupPaths.push(dataDir);

    const service = new DesktopPgliteService(dataDir);
    const db = await service.init();

    const migrationRows = await db.query<{
      migration_name: string;
    }>('SELECT migration_name FROM _prisma_migrations ORDER BY migration_name');
    const workspaceRows = await db.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_name = 'desktop_workspace'",
    );
    const userColumnRows = await db.query<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'users' ORDER BY column_name",
    );
    const prismaService = new DesktopPrismaService(db);

    await prismaService.bootstrapLocalIdentity('local-user-test');
    const userRows = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1',
      ['local-user-test'],
    );

    expect(service.getDataDir()).toBe(dataDir);
    expect(migrationRows.rows).toEqual([
      { migration_name: '0001_init' },
      { migration_name: '0002_local_cloud_identity' },
      { migration_name: '0003_normalize_user_auth_provider_column' },
    ]);
    expect(workspaceRows.rows).toEqual([{ name: 'desktop_workspace' }]);
    expect(userColumnRows.rows).toContainEqual({ name: 'auth_provider_id' });
    expect(userColumnRows.rows).not.toContainEqual({ name: 'authprovider_id' });
    expect(userRows.rows).toEqual([{ id: 'local-user-test' }]);

    await service.close();
  });
});
