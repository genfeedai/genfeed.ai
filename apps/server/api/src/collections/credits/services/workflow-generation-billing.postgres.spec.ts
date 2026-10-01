import { randomUUID } from 'node:crypto';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { WorkflowGenerationBillingService } from '@api/collections/credits/services/workflow-generation-billing.service';
import {
  applyWorkflowOperationEvidence,
  closeWorkflowDispatch,
} from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { WorkflowExecutionGenerationBilling } from '@genfeedai/contracts/interfaces/billing';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

function transactionGate() {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, promise };
}

async function insertFundedExecution(
  pool: Pool,
  schema: string,
  executionId: string,
) {
  const now = new Date();
  let plan = workflowFundingFixture(executionId);
  plan.expiresAt = new Date(now.getTime() + 3_600_000).toISOString();
  plan = applyWorkflowOperationEvidence(
    plan,
    {
      operationId: plan.manifest.allocations[0].operationId,
      phase: 'claimed',
      claimId: 'initial-claim',
    },
    now,
  );
  await pool.query(
    `INSERT INTO "${schema}"."workflow_executions"
    ("id", "organizationId", "userId", "workflowVersionId", "status", "generationBilling")
    VALUES ($1, 'org-a', 'user-a', 'version-a', 'RUNNING', $2::jsonb)`,
    [executionId, JSON.stringify(plan)],
  );
  await pool.query(
    `INSERT INTO "${schema}"."credit_reservations"
    ("id", "billingAccountId", "organizationId", "actorUserId", "amount", "workloadType", "workloadId",
     "idempotencyKey", "metadata", "expiresAt", "workflowExecutionId")
    VALUES ($1, 'test-wallet', 'org-a', 'user-a', 6, 'workflow-generation', $2, $3, $4::jsonb, $5, $2)`,
    [
      plan.reservationId,
      executionId,
      `workflow-generation:${executionId}`,
      JSON.stringify({ preservedAudit: true, workflowFunding: plan }),
      plan.expiresAt,
    ],
  );
  return plan;
}

// Explicit isolated local test database only. Never fall back to DATABASE_URL.
const connectionString = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'workflow financial proof PostgreSQL concurrency',
  () => {
    const schema = `billing_proof_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Dedicated workflow billing test database is required');
      const url = new URL(connectionString);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new Error(
          'Workflow proof test requires an isolated local PostgreSQL database',
        );
      pool = new Pool({ connectionString });
      // Only this test's fresh schema is written or dropped.
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(
        `CREATE TYPE "${schema}"."CreditReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'EXPIRED')`,
      );
      await pool.query(`CREATE TABLE "${schema}"."workflow_executions" (
      "id" text PRIMARY KEY, "organizationId" text NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false,
      "userId" text NOT NULL, "workflowVersionId" text NOT NULL, "status" text NOT NULL, "generationBilling" jsonb, "updatedAt" timestamp(3) NOT NULL DEFAULT now()
    )`);
      await pool.query(`CREATE TABLE "${schema}"."credit_reservations" (
      "id" text PRIMARY KEY, "billingAccountId" text NOT NULL, "organizationId" text NOT NULL,
      "actorUserId" text, "amount" double precision NOT NULL, "settledAmount" double precision,
      "status" "${schema}"."CreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
      "workloadType" text, "workloadId" text, "idempotencyKey" text NOT NULL,
      "description" text, "source" text, "metadata" jsonb, "expiresAt" timestamp(3) NOT NULL,
      "isDeleted" boolean NOT NULL DEFAULT false, "createdAt" timestamp(3) NOT NULL DEFAULT now(),
      "updatedAt" timestamp(3) NOT NULL DEFAULT now(), "workflowExecutionId" text,
      "workflowNodeId" text, "workflowOperationId" text
    )`);
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });

    function billingService() {
      return new WorkflowGenerationBillingService(
        prisma as unknown as PrismaService,
        {} as CreditsUtilsService,
        { warn: vi.fn() } as unknown as LoggerService,
      );
    }
    async function savedFunding(plan: WorkflowExecutionGenerationBilling) {
      const row = await prisma.creditReservation.findFirstOrThrow({
        where: {
          id: plan.reservationId ?? '',
          organizationId: 'org-a',
          isDeleted: false,
        },
        select: { metadata: true },
      });
      return (
        row.metadata as unknown as {
          workflowFunding: WorkflowExecutionGenerationBilling;
        }
      ).workflowFunding;
    }

    it('fences a claimed provider dispatch when closure owns the execution mutex first', async () => {
      const plan = await insertFundedExecution(pool, schema, 'closure-wins');
      const service = billingService();
      const closed = transactionGate();
      const release = transactionGate();
      const closing = prisma.$transaction(async (tx) => {
        await service.closeInTransaction(tx, 'closure-wins', 'org-a');
        closed.open();
        await release.promise;
      });
      await closed.promise;
      const submitting = prisma.$transaction((tx) =>
        service.recordSubmissionIntent(
          tx,
          'closure-wins',
          'org-a',
          plan.manifest.allocations[0].operationId,
          plan.manifest.allocations[0].dispatch.billableFingerprint,
          'initial-claim',
        ),
      );
      const denied = expect(submitting).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Workflow funding admission is closed',
        }),
      });
      release.open();
      await closing;
      await denied;
      const saved = await savedFunding(plan);
      expect(saved.dispatchClosed).toBe(true);
      expect(saved.operations.map((operation) => operation.phase)).toEqual([
        'unsubmitted',
        'unsubmitted',
      ]);
    });

    it('retains submitted funding when provider intent owns the execution mutex before closure', async () => {
      const plan = await insertFundedExecution(pool, schema, 'intent-wins');
      const service = billingService();
      const submitted = transactionGate();
      const release = transactionGate();
      const submitting = prisma.$transaction(async (tx) => {
        await service.recordSubmissionIntent(
          tx,
          'intent-wins',
          'org-a',
          plan.manifest.allocations[0].operationId,
          plan.manifest.allocations[0].dispatch.billableFingerprint,
          'initial-claim',
        );
        submitted.open();
        await release.promise;
      });
      await submitted.promise;
      const closing = prisma.$transaction((tx) =>
        service.closeInTransaction(tx, 'intent-wins', 'org-a'),
      );
      release.open();
      await Promise.all([submitting, closing]);
      const saved = await savedFunding(plan);
      expect(saved.dispatchClosed).toBe(true);
      expect(saved.operations.map((operation) => operation.phase)).toEqual([
        'submission-intent',
        'unsubmitted',
      ]);
    });

    it('denies a stale claimant after reclaim commits before its provider intent', async () => {
      const plan = await insertFundedExecution(pool, schema, 'reclaim-wins');
      const service = billingService();
      const reclaimed = transactionGate();
      const release = transactionGate();
      const reclaiming = prisma.$transaction(async (tx) => {
        await service.admitNode(
          tx,
          'reclaim-wins',
          'org-a',
          'video',
          'new-claim',
        );
        reclaimed.open();
        await release.promise;
      });
      await reclaimed.promise;
      const submitting = prisma.$transaction((tx) =>
        service.recordSubmissionIntent(
          tx,
          'reclaim-wins',
          'org-a',
          plan.manifest.allocations[0].operationId,
          plan.manifest.allocations[0].dispatch.billableFingerprint,
          'initial-claim',
        ),
      );
      const denied = expect(submitting).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Workflow operation already has provider intent',
        }),
      });
      release.open();
      await reclaiming;
      await denied;
      expect((await savedFunding(plan)).operations[0]).toMatchObject({
        phase: 'claimed',
        claimId: 'new-claim',
      });
    });

    it('preserves both concurrent completions after hard purge removes the execution mutex', async () => {
      const now = new Date('2026-09-30T00:01:00.000Z');
      let plan = workflowFundingFixture();
      for (const allocation of plan.manifest.allocations) {
        plan = applyWorkflowOperationEvidence(
          plan,
          {
            operationId: allocation.operationId,
            phase: 'claimed',
            claimId: allocation.nodeId,
          },
          now,
        );
        plan = applyWorkflowOperationEvidence(
          plan,
          {
            operationId: allocation.operationId,
            phase: 'submission-intent',
            intentId: allocation.operationId,
            observedAt: now.toISOString(),
          },
          now,
        );
      }
      plan = closeWorkflowDispatch(plan, now);
      await pool.query(
        `INSERT INTO "${schema}"."credit_reservations"
      ("id", "billingAccountId", "organizationId", "actorUserId", "amount", "workloadType", "workloadId",
       "idempotencyKey", "metadata", "expiresAt", "workflowExecutionId")
      VALUES ($1, 'test-wallet', 'org-a', 'user-a', 6, 'workflow-generation', 'execution-a',
        'workflow-generation:execution-a', $2::jsonb, '2026-10-01', 'execution-a')`,
        [
          plan.reservationId,
          JSON.stringify({ preservedAudit: true, workflowFunding: plan }),
        ],
      );

      // Before the fix, both readers see old proof and then overwrite each other.
      // With the reservation lock, the first reader times out this rendezvous while
      // holding the row; the second reader then observes the committed first proof.
      let reads = 0;
      let releaseFirst: (() => void) | undefined;
      const rendezvous = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const concurrentClient = prisma.$extends({
        query: {
          creditReservation: {
            async findFirst({ args, query }) {
              const result = await query(args);
              reads += 1;
              if (reads === 2) releaseFirst?.();
              if (reads === 1)
                await Promise.race([
                  rendezvous,
                  new Promise<void>((resolve) => setTimeout(resolve, 75)),
                ]);
              return result;
            },
          },
        },
      });
      const service = new WorkflowGenerationBillingService(
        concurrentClient as unknown as PrismaService,
        {} as CreditsUtilsService,
        { warn: vi.fn() } as unknown as LoggerService,
      );
      await Promise.all(
        plan.manifest.allocations.map((allocation, index) =>
          concurrentClient.$transaction(
            (tx) =>
              service.recordOperationProof(
                tx as unknown as Prisma.TransactionClient,
                'execution-a',
                'org-a',
                {
                  operationId: allocation.operationId,
                  phase: 'completed',
                  intentId: allocation.operationId,
                  proofId: `durable-artifact-${index}`,
                  observedAt: now.toISOString(),
                  artifacts: [
                    {
                      ingredientId: `asset-${index}`,
                      assetKey: `durable/video-${index}.mp4`,
                      role: 'primary',
                    },
                  ],
                  completion: { completedOutputs: 1, successfulRequests: 1 },
                },
              ),
            { isolationLevel: 'ReadCommitted' },
          ),
        ),
      );
      const saved = await prisma.creditReservation.findFirst({
        where: {
          id: plan.reservationId ?? '',
          organizationId: 'org-a',
          isDeleted: false,
        },
        select: { metadata: true },
      });
      const metadata = saved?.metadata as unknown as {
        preservedAudit: boolean;
        workflowFunding: WorkflowExecutionGenerationBilling;
      };
      expect(metadata.preservedAudit).toBe(true);
      expect(
        metadata.workflowFunding.operations.map((operation) => operation.phase),
      ).toEqual(['completed', 'completed']);
    });
  },
);
