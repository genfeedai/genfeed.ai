import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorkspaceInboxReadService } from '@api/collections/tasks/services/workspace-inbox-read.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

describe('Workspace inbox read versions (real Postgres)', () => {
  const schema = `workspace_inbox_${randomUUID().replaceAll('-', '')}`;
  const version = '2026-10-05T10:00:00.000Z';
  const newerVersion = '2026-10-05T10:01:00.000Z';
  let sql: Client;
  let prisma: PrismaClient;
  let inbox: WorkspaceInboxReadService;
  let historicalRecipients: string[] = [];

  beforeAll(async () => {
    const connectionString = assertIsolatedDatabaseUrl();
    sql = new Client({ connectionString });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}", public`);
    // Only the tables referenced by this additive migration, in a uniquely
    // owned schema; no application or shared test tables are modified.
    await sql.query(`
      CREATE TABLE users (id TEXT PRIMARY KEY, "isDeleted" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE organizations (id TEXT PRIMARY KEY, "isDeleted" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE members ("organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "isDeleted" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true);
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES organizations(id),
        "updatedAt" TIMESTAMP(3) NOT NULL, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "dismissedAt" TIMESTAMP(3), "reviewState" TEXT NOT NULL DEFAULT 'none', "status" TEXT NOT NULL DEFAULT 'backlog'
      );
      INSERT INTO users (id) VALUES ('alice'), ('bob');
      INSERT INTO organizations (id) VALUES ('alpha'), ('bravo');
      INSERT INTO members ("organizationId", "userId") VALUES ('alpha', 'alice'), ('alpha', 'bob');
      INSERT INTO tasks (id, "organizationId", "updatedAt") VALUES
        ('alpha-1', 'alpha', '${version}'), ('alpha-2', 'alpha', '${version}'), ('bravo-1', 'bravo', '${version}');
      INSERT INTO tasks (id, "organizationId", "updatedAt", status) VALUES ('alpha-old', 'alpha', '${version}', 'done');
    `);
    await sql.query(
      readFileSync(
        resolve(
          '../../../packages/prisma/prisma/migrations/20261005110000_workspace_inbox_reads/migration.sql',
        ),
        'utf8',
      ),
    );
    historicalRecipients = (
      await sql.query(
        'SELECT "userId" FROM workspace_inbox_reads WHERE "taskId" = $1 ORDER BY "userId"',
        ['alpha-old'],
      )
    ).rows.map((row: { userId: string }) => row.userId);
    await sql.query('UPDATE tasks SET "isDeleted" = true WHERE id = $1', [
      'alpha-old',
    ]);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: '-c search_path=' + schema + ',public' },
        { schema },
      ),
    });
    inbox = new WorkspaceInboxReadService(prisma as PrismaService);
  });

  beforeEach(async () => {
    await sql.query('TRUNCATE workspace_inbox_reads');
    await sql.query("DELETE FROM tasks WHERE id LIKE 'bulk-%'");
    await sql.query('UPDATE tasks SET "updatedAt" = $1', [version]);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it('backfills historical completed tasks for existing recipients', () => {
    expect(historicalRecipients).toEqual(['alice', 'bob']);
  });

  it('persists read state for one recipient without leaking it to another user or organization', async () => {
    await inbox.markRead('alpha', 'alice', [
      { taskId: 'alpha-1', seenUpdatedAt: version },
    ]);
    expect(await inbox.list('alpha', 'alice')).toMatchObject({
      unreadCount: 1,
      reads: [{ taskId: 'alpha-1', seenUpdatedAt: version }],
    });
    expect(await inbox.list('alpha', 'bob')).toMatchObject({
      unreadCount: 2,
      reads: [],
    });
    expect(await inbox.list('bravo', 'alice')).toMatchObject({
      unreadCount: 1,
      reads: [],
    });
  });

  it('marks all read, preserves task state, and makes a later update unread again', async () => {
    expect(await inbox.markAllRead('alpha', 'alice')).toMatchObject({
      unreadCount: 0,
    });
    expect(
      (
        await sql.query(
          'SELECT "reviewState" FROM tasks WHERE "organizationId" = $1 AND NOT "isDeleted"',
          ['alpha'],
        )
      ).rows,
    ).toEqual([{ reviewState: 'none' }, { reviewState: 'none' }]);
    await sql.query('UPDATE tasks SET "updatedAt" = $1 WHERE id = $2', [
      newerVersion,
      'alpha-1',
    ]);
    expect(await inbox.list('alpha', 'alice')).toMatchObject({
      unreadCount: 1,
    });
  });

  it('never replaces a newer acknowledgement with an older concurrent acknowledgement', async () => {
    await sql.query('UPDATE tasks SET "updatedAt" = $1 WHERE id = $2', [
      newerVersion,
      'alpha-1',
    ]);
    await Promise.all([
      inbox.markRead('alpha', 'alice', [
        { taskId: 'alpha-1', seenUpdatedAt: newerVersion },
      ]),
      inbox.markRead('alpha', 'alice', [
        { taskId: 'alpha-1', seenUpdatedAt: version },
      ]),
    ]);
    expect((await inbox.list('alpha', 'alice')).reads).toEqual([
      { taskId: 'alpha-1', seenUpdatedAt: newerVersion },
    ]);
  });

  it('marks thousands of tasks read without a per-task write loop', async () => {
    await sql.query(
      'INSERT INTO tasks (id, "organizationId", "updatedAt") SELECT \'bulk-\' || n, \'alpha\', $1::timestamp FROM generate_series(1, 2000) n',
      [version],
    );
    expect(await inbox.markAllRead('alpha', 'alice')).toMatchObject({
      unreadCount: 0,
    });
    expect((await inbox.list('alpha', 'alice')).reads).toHaveLength(2002);
  });

  it('enforces task organization ownership in the database', async () => {
    await expect(
      prisma.workspaceInboxRead.create({
        data: {
          organizationId: 'alpha',
          userId: 'alice',
          taskId: 'bravo-1',
          seenUpdatedAt: new Date(version),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an entire mixed-organization read batch without partial writes', async () => {
    await expect(
      inbox.markRead('alpha', 'alice', [
        { taskId: 'alpha-1', seenUpdatedAt: version },
        { taskId: 'bravo-1', seenUpdatedAt: version },
      ]),
    ).rejects.toThrow('Invalid workspace inbox task version');
    expect((await inbox.list('alpha', 'alice')).reads).toEqual([]);
  });
});
