import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { findReviewTurboRunIdBySourceKeys } from '@api/collections/turbo-projects/services/turbo-project-review-turbo-run.util';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

// Real PostgreSQL and real Prisma JSON-path filtering in a uniquely owned
// schema: the lookup reconcile uses to adopt a review batch whose id a crash
// left unsaved (#5463).
describe('Batch project review-batch lookup by source key (real Postgres)', () => {
  const schema = `turbo_run_review_${randomUUID().replaceAll('-', '')}`;
  let sql: Client;
  let prisma: PrismaClient;

  function turboRunItemData(id: string, sourceActionId: string) {
    return { format: 'image', id, sourceActionId, status: 'completed' };
  }

  beforeAll(async () => {
    const connectionString = assertIsolatedDatabaseUrl();
    sql = new Client({ connectionString });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}", public`);
    const ddl = execFileSync(
      'bunx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema',
        resolve('../../../packages/prisma/prisma/schema.prisma'),
        '--script',
      ],
      {
        cwd: resolve('../../../packages/prisma'),
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    await sql.query(
      ddl
        .replaceAll('"public".', '')
        .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
    );
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });

    await prisma.user.createMany({
      data: [
        { handle: 'alice', id: 'alice' },
        { handle: 'bob', id: 'bob' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: 'alpha', label: 'Alpha', slug: 'alpha', userId: 'alice' },
        { id: 'bravo', label: 'Bravo', slug: 'bravo', userId: 'bob' },
      ],
    });
    await prisma.turboRun.createMany({
      data: [
        { id: 'batch-live', organizationId: 'alpha', userId: 'alice' },
        {
          id: 'batch-deleted',
          isDeleted: true,
          organizationId: 'alpha',
          userId: 'alice',
        },
        { id: 'batch-other-org', organizationId: 'bravo', userId: 'bob' },
      ],
    });
    await prisma.turboRunItem.createMany({
      data: [
        {
          turboRunId: 'batch-live',
          data: turboRunItemData('row-1', 'turbo-project-item:item-1'),
          id: 'row-1',
          organizationId: 'alpha',
        },
        {
          turboRunId: 'batch-deleted',
          data: turboRunItemData('row-2', 'turbo-project-item:item-2'),
          id: 'row-2',
          organizationId: 'alpha',
        },
        {
          turboRunId: 'batch-other-org',
          data: turboRunItemData('row-3', 'turbo-project-item:item-3'),
          id: 'row-3',
          organizationId: 'bravo',
        },
        {
          turboRunId: 'batch-live',
          data: turboRunItemData('row-4', 'turbo-project-item:item-4'),
          id: 'row-4',
          isDeleted: true,
          organizationId: 'alpha',
        },
      ],
    });
  }, 120000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it('finds the live batch holding one of the source keys', async () => {
    await expect(
      findReviewTurboRunIdBySourceKeys(prisma, 'alpha', [
        'turbo-project-item:unknown',
        'turbo-project-item:item-1',
      ]),
    ).resolves.toBe('batch-live');
  });

  it('ignores removed batches, removed items and other organizations', async () => {
    for (const sourceKey of [
      'turbo-project-item:item-2',
      'turbo-project-item:item-3',
      'turbo-project-item:item-4',
    ]) {
      await expect(
        findReviewTurboRunIdBySourceKeys(prisma, 'alpha', [sourceKey]),
      ).resolves.toBeNull();
    }
  });

  it('matches the source key exactly, not as a prefix', async () => {
    await expect(
      findReviewTurboRunIdBySourceKeys(prisma, 'alpha', [
        'turbo-project-item:item',
      ]),
    ).resolves.toBeNull();
  });
});
