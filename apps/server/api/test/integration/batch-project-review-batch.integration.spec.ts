import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { findReviewBatchIdBySourceKeys } from '@api/collections/batch-projects/services/batch-project-review-batch.util';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

// Real PostgreSQL and real Prisma JSON-path filtering in a uniquely owned
// schema: the lookup reconcile uses to adopt a review batch whose id a crash
// left unsaved (#5463).
describe('Batch project review-batch lookup by source key (real Postgres)', () => {
  const schema = `batch_review_${randomUUID().replaceAll('-', '')}`;
  let sql: Client;
  let prisma: PrismaClient;

  function batchItemData(id: string, sourceActionId: string) {
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
    await prisma.batch.createMany({
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
    await prisma.batchItem.createMany({
      data: [
        {
          batchId: 'batch-live',
          data: batchItemData('row-1', 'batch-project-item:item-1'),
          id: 'row-1',
          organizationId: 'alpha',
        },
        {
          batchId: 'batch-deleted',
          data: batchItemData('row-2', 'batch-project-item:item-2'),
          id: 'row-2',
          organizationId: 'alpha',
        },
        {
          batchId: 'batch-other-org',
          data: batchItemData('row-3', 'batch-project-item:item-3'),
          id: 'row-3',
          organizationId: 'bravo',
        },
        {
          batchId: 'batch-live',
          data: batchItemData('row-4', 'batch-project-item:item-4'),
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
      findReviewBatchIdBySourceKeys(prisma, 'alpha', [
        'batch-project-item:unknown',
        'batch-project-item:item-1',
      ]),
    ).resolves.toBe('batch-live');
  });

  it('ignores removed batches, removed items and other organizations', async () => {
    for (const sourceKey of [
      'batch-project-item:item-2',
      'batch-project-item:item-3',
      'batch-project-item:item-4',
    ]) {
      await expect(
        findReviewBatchIdBySourceKeys(prisma, 'alpha', [sourceKey]),
      ).resolves.toBeNull();
    }
  });

  it('matches the source key exactly, not as a prefix', async () => {
    await expect(
      findReviewBatchIdBySourceKeys(prisma, 'alpha', [
        'batch-project-item:item',
      ]),
    ).resolves.toBeNull();
  });
});
