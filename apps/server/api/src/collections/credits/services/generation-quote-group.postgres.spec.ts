import { randomUUID } from 'node:crypto';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import type { GenerationCreditReservationRequest } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Only the dedicated isolated local database; never DATABASE_URL.
const connectionString = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'composable generation binding PostgreSQL atomicity',
  () => {
    const schema = `billing_binding_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    let service: GenerationQuoteGroupService;
    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Dedicated billing test database is required');
      const url = new URL(connectionString);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new Error(
          'Binding test requires an isolated local PostgreSQL database',
        );
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(
        `CREATE TYPE "${schema}"."CreditReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'EXPIRED')`,
      );
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
      await pool.query(`CREATE TABLE "${schema}"."ingredients" (
      "id" text PRIMARY KEY, "organizationId" text NOT NULL,
      "isDeleted" boolean NOT NULL DEFAULT false, "generationBilling" jsonb,
      "updatedAt" timestamp(3) NOT NULL DEFAULT now()
    )`);
      await pool.query(`CREATE TABLE "${schema}"."content_runs" (
      "id" text PRIMARY KEY, "organizationId" text NOT NULL,
      "isDeleted" boolean NOT NULL DEFAULT false, "config" jsonb NOT NULL DEFAULT '{}',
      "updatedAt" timestamp(3) NOT NULL DEFAULT now()
    )`);
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      service = new GenerationQuoteGroupService(
        {} as CreditsUtilsService,
        prisma as unknown as PrismaService,
        {} as LoggerService,
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });
    async function insertIntent(
      id: string,
    ): Promise<GenerationCreditReservationRequest> {
      const quote = quoteModelBillablePricing(
        billableProfile({ cost: 3 }),
        {
          modelKey: 'test/model',
          provider: 'replicate',
          requests: 1,
          outputs: 1,
        },
        1,
        '2026-09-30T00:00:00.000Z',
      );
      if (quote.status !== 'priced') throw new Error(quote.reason);
      await pool.query(
        `INSERT INTO "${schema}"."credit_reservations"
      ("id", "billingAccountId", "organizationId", "actorUserId", "amount", "workloadType", "workloadId", "idempotencyKey", "metadata", "expiresAt")
      VALUES ($1, 'wallet-test', 'org-test', 'user-test', 3, $2, $3, $3, $4::jsonb, $5)`,
        [
          `hold-${id}`,
          MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
          id,
          JSON.stringify({
            modelQuote: quote.snapshot,
            boundOutputIds: [],
            dispatchClosed: false,
            failedOutputIds: [],
            completedArtifacts: [],
          }),
          new Date(Date.now() + 3_600_000),
        ],
      );
      await pool.query(
        `INSERT INTO "${schema}"."ingredients" ("id", "organizationId") VALUES ($1, 'org-test')`,
        [`output-${id}`],
      );
      await pool.query(
        `INSERT INTO "${schema}"."content_runs" ("id", "organizationId") VALUES ($1, 'org-test')`,
        [id],
      );
      return {
        creditsConfig: {
          reservationId: `hold-${id}`,
          description: 'synthetic atomic binding fixture',
        },
        user: {
          organizationId: 'org-test',
        } as GenerationCreditReservationRequest['user'],
      };
    }
    async function compose(id: string, reject: boolean) {
      const request = await insertIntent(id);
      return prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "content_runs" WHERE "id" = ${id} AND "organizationId" = 'org-test' AND "isDeleted" = false FOR UPDATE`,
          );
          await service.bindOutputInTransaction(tx, request, `output-${id}`);
          await tx.contentRun.updateMany({
            where: { id, organizationId: 'org-test', isDeleted: false },
            data: { config: { fixtureSubmissionIntent: id } },
          });
          if (reject) throw new Error('synthetic caller transaction failed');
        },
        { isolationLevel: 'Serializable' },
      );
    }
    async function saved(id: string) {
      const rows = await pool.query(
        `SELECT r."metadata", i."generationBilling", c."config"
      FROM "${schema}"."credit_reservations" r
      JOIN "${schema}"."ingredients" i ON i."id" = $2
      JOIN "${schema}"."content_runs" c ON c."id" = $3 WHERE r."id" = $1`,
        [`hold-${id}`, `output-${id}`, id],
      );
      return rows.rows[0];
    }
    it('commits caller intent, ingredient receipt and funded output membership together', async () => {
      await compose('commit', false);
      expect(await saved('commit')).toMatchObject({
        metadata: { boundOutputIds: ['output-commit'] },
        generationBilling: {
          kind: 'quote-group',
          reservationId: 'hold-commit',
          outputIndex: 0,
        },
        config: { fixtureSubmissionIntent: 'commit' },
      });
    });
    it('rolls all three writes back when the caller admission transaction fails', async () => {
      await expect(compose('rollback', true)).rejects.toThrow(
        'synthetic caller transaction failed',
      );
      expect(await saved('rollback')).toMatchObject({
        metadata: { boundOutputIds: [] },
        generationBilling: null,
        config: {},
      });
    });
  },
);
