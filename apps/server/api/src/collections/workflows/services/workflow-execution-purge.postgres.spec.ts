import { randomUUID } from 'node:crypto';
import { WorkflowExecutionPurgeService } from '@api/collections/workflows/services/workflow-execution-purge.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * The bulk purge of finished background runs against real PostgreSQL (#10382,
 * #10383): what is deleted, what stays, and what leaves with a run.
 */
describe.skipIf(!connectionString)(
  'WorkflowExecutionPurgeService on PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const db = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const suffix = randomUUID();
    const userId = `purge-user-${suffix}`;
    const orgId = `purge-org-${suffix}`;
    const brandId = `purge-brand-${suffix}`;
    const workflowId = `purge-workflow-${suffix}`;
    const versionId = `purge-version-${suffix}`;
    const now = new Date('2026-11-16T12:00:00.000Z');
    const past = new Date('2026-11-01T00:00:00.000Z');
    const future = new Date('2026-12-01T00:00:00.000Z');
    const logger = { log: vi.fn() } as unknown as LoggerService;
    const service = () =>
      new WorkflowExecutionPurgeService(
        db() as unknown as PrismaService,
        logger,
      );

    async function insertRun(
      name: string,
      run: {
        purgeAt: Date | null;
        retentionPolicy: 'background' | 'kept' | null;
        status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'RUNNING';
        updatedAt?: Date;
      },
    ): Promise<string> {
      const id = `${name}-${suffix}`;
      await db().$executeRaw`
        INSERT INTO workflow_executions
          (id, "workflowId", "workflowVersionId", "userId", "organizationId",
           status, "purgeAt", "retentionPolicy", "updatedAt")
        VALUES
          (${id}, ${workflowId}, ${versionId}, ${userId}, ${orgId},
           ${run.status}::"WorkflowExecutionStatus", ${run.purgeAt},
           ${run.retentionPolicy}, ${run.updatedAt ?? now})`;
      await db().$executeRaw`
        INSERT INTO workflow_execution_node_results
          (id, "organizationId", "executionId", "nodeId", "nodeType", status, "updatedAt")
        VALUES (${`${id}-result`}, ${orgId}, ${id}, 'node', 'action', 'completed', now())`;
      await db().$executeRaw`
        INSERT INTO workflow_node_claims
          (id, "organizationId", "executionId", "nodeId", status, "updatedAt")
        VALUES (${`${id}-claim`}, ${orgId}, ${id}, 'node',
                ${run.status === 'RUNNING' ? 'running' : 'completed'}, now())`;
      return id;
    }

    async function exists(table: string, id: string): Promise<boolean> {
      const rows = await db().$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM "${table}" WHERE id = $1`,
        id,
      );
      return Number(rows[0]?.n) === 1;
    }

    async function remains(id: string) {
      return {
        claim: await exists('workflow_node_claims', `${id}-claim`),
        result: await exists('workflow_execution_node_results', `${id}-result`),
        run: await exists('workflow_executions', id),
      };
    }

    const gone = { claim: false, result: false, run: false };
    const kept = { claim: true, result: true, run: true };

    beforeAll(async () => {
      await db().$executeRaw`
        INSERT INTO users (id, handle, "updatedAt")
        VALUES (${userId}, ${userId}, now())`;
      await db().$executeRaw`
        INSERT INTO organizations (id, "userId", label, slug, "updatedAt")
        VALUES (${orgId}, ${userId}, 'Purge fixture', ${orgId}, now())`;
      await db().$executeRaw`
        INSERT INTO brands (id, "organizationId", slug, label, "updatedAt")
        VALUES (${brandId}, ${orgId}, ${brandId}, 'Purge brand', now())`;
      await db().$executeRaw`
        WITH workflow AS (
          INSERT INTO workflows (id, "userId", "organizationId", "currentVersionId", "updatedAt")
          VALUES (${workflowId}, ${userId}, ${orgId}, ${versionId}, now())
          RETURNING id
        )
        INSERT INTO workflow_versions (id, "workflowId", "organizationId", "userId", version, graph, "contentHash")
        SELECT ${versionId}, id, ${orgId}, ${userId}, 1,
               '{"nodes":[],"edges":[]}'::jsonb, ${`purge-hash-${suffix}`}
        FROM workflow`;
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.$executeRaw`DELETE FROM posts WHERE "organizationId" = ${orgId}`;
      await prisma.$executeRaw`DELETE FROM agent_publish_audits WHERE "organizationId" = ${orgId}`;
      await prisma.$executeRaw`DELETE FROM workflow_executions WHERE "organizationId" = ${orgId}`;
      // The workflow and its current version reference each other: one statement.
      await prisma.$executeRaw`
        WITH removed AS (
          DELETE FROM workflows WHERE "organizationId" = ${orgId} RETURNING id
        )
        DELETE FROM workflow_versions WHERE "workflowId" IN (SELECT id FROM removed)`;
      await prisma.$executeRaw`DELETE FROM brands WHERE "organizationId" = ${orgId}`;
      await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${orgId}`;
      await prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}`;
      await prisma.$disconnect();
    });

    it('deletes a finished background run past its purge time with its node results and claims', async () => {
      const id = await insertRun('due', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'COMPLETED',
      });

      await service().purgeExpiredExecutions({ now });

      expect(await remains(id)).toEqual(gone);
    });

    it('keeps a failed run until its longer window ends, then deletes it', async () => {
      const id = await insertRun('failed', {
        purgeAt: future,
        retentionPolicy: 'background',
        status: 'FAILED',
      });

      await service().purgeExpiredExecutions({ now });
      expect(await remains(id)).toEqual(kept);

      await service().purgeExpiredExecutions({
        now: new Date('2026-12-02T00:00:00.000Z'),
      });
      expect(await remains(id)).toEqual(gone);
    });

    it('keeps a run a person or an agent started', async () => {
      const id = await insertRun('user-started', {
        purgeAt: null,
        retentionPolicy: 'kept',
        status: 'COMPLETED',
      });

      await service().purgeExpiredExecutions({ now });

      expect(await remains(id)).toEqual(kept);
    });

    it('leaves a run that has not finished, and its running claim, untouched', async () => {
      const id = await insertRun('running', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'RUNNING',
      });

      await service().purgeExpiredExecutions({ now });

      expect(await remains(id)).toEqual(kept);
    });

    it('keeps a run with a stored artifact, and deletes it once the artifact is gone', async () => {
      const id = await insertRun('artifact', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'COMPLETED',
      });
      await db().$executeRaw`
        INSERT INTO workflow_artifacts
          (id, "organizationId", "executionId", "nodeId", "storageKey", kind, state, "expiresAt", "updatedAt")
        VALUES (${`${id}-artifact`}, ${orgId}, ${id}, 'node', ${`key-${id}`}, 'video',
                'PROMOTED'::"WorkflowArtifactState", ${future}, now())`;

      await service().purgeExpiredExecutions({ now });
      expect(await remains(id)).toEqual(kept);

      await db().$executeRaw`
        UPDATE workflow_artifacts SET state = 'DELETED'::"WorkflowArtifactState"
        WHERE id = ${`${id}-artifact`}`;
      await service().purgeExpiredExecutions({ now });
      expect(await remains(id)).toEqual(gone);
      expect(await exists('workflow_artifacts', `${id}-artifact`)).toBe(false);
    });

    it('keeps a run an agent audit row depends on without failing the batch', async () => {
      const audited = await insertRun('audited', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'COMPLETED',
      });
      const plain = await insertRun('audit-neighbour', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'COMPLETED',
      });
      await db().$executeRaw`
        INSERT INTO agent_publish_audits
          (id, "userId", "organizationId", "workflowExecutionId", "autonomyMode", "policyName", decision, reason)
        VALUES (${`audit-${suffix}`}, ${userId}, ${orgId}, ${audited}, 'manual', 'policy',
                'DENIED'::"agent_publish_decision", 'fixture')`;

      await service().purgeExpiredExecutions({ now });

      expect(await remains(audited)).toEqual(kept);
      expect(await remains(plain)).toEqual(gone);
    });

    it('keeps a run linked from a post that is still scheduled and unlinks a published one', async () => {
      const scheduled = await insertRun('post-scheduled', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'COMPLETED',
      });
      const published = await insertRun('post-published', {
        purgeAt: past,
        retentionPolicy: 'background',
        status: 'COMPLETED',
      });
      await db().$executeRaw`
        INSERT INTO posts
          (id, "userId", "organizationId", "brandId", description, "workflowExecutionId", "targetExecutionState", "updatedAt")
        VALUES
          (${`post-s-${suffix}`}, ${userId}, ${orgId}, ${brandId}, 'scheduled', ${scheduled}, 'scheduled', now()),
          (${`post-p-${suffix}`}, ${userId}, ${orgId}, ${brandId}, 'published', ${published}, 'published', now())`;

      await service().purgeExpiredExecutions({ now });

      expect(await remains(scheduled)).toEqual(kept);
      expect(await remains(published)).toEqual(gone);
      const [post] = await db().$queryRaw<
        Array<{ workflowExecutionId: string | null }>
      >`SELECT "workflowExecutionId" FROM posts WHERE id = ${`post-p-${suffix}`}`;
      expect(post?.workflowExecutionId).toBeNull();
    });

    it('deletes in bounded batches and reports what it removed', async () => {
      const ids = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          insertRun(`batch-${n}`, {
            purgeAt: new Date(`2000-01-0${n}T00:00:00.000Z`),
            retentionPolicy: 'background',
            status: 'COMPLETED',
          }),
        ),
      );

      const first = await service().purgeExpiredExecutions({
        batchSize: 2,
        maxBatches: 2,
        now,
      });
      expect(first).toEqual({ batches: 2, executions: 4 });
      const left = await Promise.all(
        ids.map((id) => exists('workflow_executions', id)),
      );
      expect(left.filter(Boolean)).toHaveLength(1);

      const second = await service().purgeExpiredExecutions({
        batchSize: 2,
        maxBatches: 5,
        now,
      });
      expect(second).toEqual({ batches: 1, executions: 1 });
    });

    async function readRun(id: string) {
      const rows = await db().$queryRawUnsafe<
        Array<{ error: string | null; purgeAt: Date | null; status: string }>
      >(
        `SELECT status::text AS status, error, "purgeAt" FROM workflow_executions WHERE id = $1`,
        id,
      );
      return rows[0];
    }

    describe('stale runs', () => {
      const longAgo = new Date('2026-09-01T00:00:00.000Z');

      it('fails a run left running for weeks and schedules a background one for purge in 14 days', async () => {
        const background = await insertRun('stale-bg', {
          purgeAt: null,
          retentionPolicy: 'background',
          status: 'RUNNING',
          updatedAt: longAgo,
        });
        const legacy = await insertRun('stale-legacy', {
          purgeAt: null,
          retentionPolicy: null,
          status: 'PENDING',
          updatedAt: longAgo,
        });

        await service().failStaleExecutions({ now });

        expect(await readRun(background)).toEqual({
          error: 'Run abandoned: no progress for over 7 days',
          purgeAt: new Date('2026-11-30T12:00:00.000Z'),
          status: 'FAILED',
        });
        expect(await readRun(legacy)).toEqual({
          error: 'Run abandoned: no progress for over 7 days',
          purgeAt: null,
          status: 'FAILED',
        });
      });

      it('leaves a run that wrote recently and a finished run alone', async () => {
        const recent = await insertRun('stale-recent', {
          purgeAt: null,
          retentionPolicy: 'background',
          status: 'RUNNING',
          updatedAt: new Date('2026-11-14T12:00:00.000Z'),
        });
        const done = await insertRun('stale-done', {
          purgeAt: future,
          retentionPolicy: 'background',
          status: 'COMPLETED',
          updatedAt: longAgo,
        });

        expect(await service().failStaleExecutions({ now })).toBe(0);

        expect((await readRun(recent))?.status).toBe('RUNNING');
        expect((await readRun(done))?.status).toBe('COMPLETED');
      });

      it('lets the purge delete a failed stale background run with its claim once due', async () => {
        const id = await insertRun('stale-purged', {
          purgeAt: null,
          retentionPolicy: 'background',
          status: 'RUNNING',
          updatedAt: longAgo,
        });

        await service().failStaleExecutions({ now });
        await service().purgeExpiredExecutions({
          now: new Date('2026-12-01T00:00:00.000Z'),
        });

        expect(await remains(id)).toEqual(gone);
      });
    });
  },
);
