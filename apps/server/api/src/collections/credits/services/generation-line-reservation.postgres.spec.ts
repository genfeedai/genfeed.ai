import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import type { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationLineReservationService } from '@api/collections/credits/services/generation-line-reservation.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import type { GenerationLineReservationIntent } from '@api/helpers/utils/credits/generation-line-reservation.schema';
import {
  buildGenerationLineReservationIntent,
  generationLineIdentity,
} from '@api/helpers/utils/credits/generation-line-reservation.util';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  usesMeteredCredits: () => true,
}));
const connectionString = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'frozen line real-ledger PostgreSQL admission and attachment',
  () => {
    const schema = `billing_line_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    let service: GenerationLineReservationService;
    let group: GenerationQuoteGroupService;
    const credits = {
      reserveCredits: vi.fn(),
      releaseReservation: vi.fn(),
      settleReservation: vi.fn(),
    };
    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Dedicated billing test database required');
      const url = new URL(connectionString);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new Error('Isolated local database required');
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const crunMigration = readFileSync(
        new URL(
          '../../../../../../../packages/prisma/prisma/migrations/20261001120000_add_crun_generation_tasks/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await pool.query(`SET search_path TO "${schema}"; ${crunMigration}`);
      await pool.query(
        `CREATE TYPE "${schema}"."CreditReservationStatus" AS ENUM ('RESERVED','SETTLED','RELEASED','EXPIRED')`,
      );
      await pool.query(`CREATE TABLE "${schema}"."credit_balances" (
      "id" text PRIMARY KEY,"organizationId" text,"billingAccountId" text,"balance" double precision NOT NULL DEFAULT 0,
      "heldAmount" double precision NOT NULL DEFAULT 0,"version" integer NOT NULL DEFAULT 0,"isDeleted" boolean NOT NULL DEFAULT false,
      "createdAt" timestamp(3) NOT NULL DEFAULT now(),"updatedAt" timestamp(3) NOT NULL DEFAULT now())`);
      await pool.query(`CREATE TABLE "${schema}"."credit_reservations" (
      "id" text PRIMARY KEY,"billingAccountId" text NOT NULL,"organizationId" text NOT NULL,"actorUserId" text,
      "amount" double precision NOT NULL,"settledAmount" double precision,"status" "${schema}"."CreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
      "workloadType" text,"workloadId" text,"idempotencyKey" text NOT NULL,"description" text,"source" text,"metadata" jsonb,
      "expiresAt" timestamp(3) NOT NULL,"isDeleted" boolean NOT NULL DEFAULT false,"createdAt" timestamp(3) NOT NULL DEFAULT now(),
      "updatedAt" timestamp(3) NOT NULL DEFAULT now(),"workflowExecutionId" text,"workflowNodeId" text,"workflowOperationId" text)`);
      await pool.query(
        `CREATE UNIQUE INDEX ON "${schema}"."credit_reservations" ("organizationId","idempotencyKey") WHERE "isDeleted" = false`,
      );
      await pool.query(`CREATE TABLE "${schema}"."content_runs" (
      "id" text PRIMARY KEY,"organizationId" text NOT NULL,"isDeleted" boolean NOT NULL DEFAULT false,"config" jsonb NOT NULL DEFAULT '{}',"updatedAt" timestamp(3) NOT NULL DEFAULT now())`);
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      const client = prisma as unknown as PrismaService;
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService;
      // Real production reserve and wallet mutation, not a simulated debit.
      const reservation = new CreditReservationService(
        client,
        logger,
        new CreditBalanceService(client, logger),
        {} as CreditTransactionsService,
        new TransactionUtil(client, logger),
      );
      credits.reserveCredits.mockImplementation((input: IReserveCreditsInput) =>
        reservation.reserve({
          ...input,
          billingAccountId: `account-${input.organizationId}`,
        }),
      );
      service = new GenerationLineReservationService(
        credits as unknown as CreditsUtilsService,
        client,
      );
      group = new GenerationQuoteGroupService(
        credits as unknown as CreditsUtilsService,
        client,
        logger,
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });
    async function prepare(id: string) {
      await pool.query(
        `INSERT INTO "${schema}"."credit_balances" ("id","organizationId","billingAccountId","balance") VALUES ($1,$2,$3,100)`,
        [`wallet-${id}`, id, `account-${id}`],
      );
      await pool.query(
        `INSERT INTO "${schema}"."content_runs" ("id","organizationId") VALUES ($1,$2)`,
        [`run-${id}`, id],
      );
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
      const owner: GenerationLineReservationIntent['owner'] = {
        kind: 'storyboard-line',
        organizationId: id,
        brandId: `brand-${id}`,
        runId: `run-${id}`,
        operationId: `op-${id}`,
        lineKey: 'shot-1',
        attempt: 1,
        actorUserId: `user-${id}`,
        quoteId: `quote-${id}`,
        preparedHash: 'a'.repeat(64),
        sourceActionId: '',
      };
      owner.sourceActionId = `storyboard-line-v1:${generationLineIdentity(owner)}`;
      return buildGenerationLineReservationIntent({
        version: 1,
        owner,
        modelQuote: quote.snapshot,
        source: ActivitySource.IMAGE_GENERATION,
        description: 'Synthetic real ledger test',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    }
    async function requireHold(intent: GenerationLineReservationIntent) {
      const result = await service.reserveOrRecover(intent);
      if (result.status !== 'reserved')
        throw new Error('Test expected funded hold');
      return result.reservationId;
    }
    async function lockedOwner(
      tx: Prisma.TransactionClient,
      intent: GenerationLineReservationIntent,
    ) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "content_runs" WHERE "id"=${intent.owner.runId} AND "organizationId"=${intent.owner.organizationId} AND "isDeleted"=false FOR UPDATE`,
      );
    }
    it('concurrent retries reserve one real wallet delta and recover the preparing crash gap', async () => {
      const intent = await prepare('concurrent');
      const results = await Promise.all([
        service.reserveOrRecover(intent),
        service.reserveOrRecover(intent),
        service.reserveOrRecover(intent),
      ]);
      expect(
        new Set(
          results.map((r) => ('reservationId' in r ? r.reservationId : null)),
        ).size,
      ).toBe(1);
      const wallet = await prisma.creditBalance.findFirstOrThrow({
        where: { organizationId: 'concurrent', isDeleted: false },
      });
      expect(wallet).toMatchObject({ balance: 100, heldAmount: 3, version: 1 });
      expect(
        await prisma.creditReservation.count({
          where: { organizationId: 'concurrent', isDeleted: false },
        }),
      ).toBe(1);
      expect(await service.readRecovery(intent)).toMatchObject({
        status: 'reserved',
        attachment: 'preparing',
      });
    });
    it('rolls owner receipt and ledger attachment back together, then commits and reattaches idempotently', async () => {
      const intent = await prepare('atomic');
      const reservationId = await requireHold(intent);
      const compose = (reject: boolean) =>
        prisma.$transaction(
          async (tx) => {
            await lockedOwner(tx, intent);
            const request = await service.attachInTransaction(tx, {
              intent,
              reservationId,
            });
            await tx.contentRun.updateMany({
              where: {
                id: intent.owner.runId,
                organizationId: 'atomic',
                isDeleted: false,
              },
              data: { config: { fixtureReservationId: reservationId } },
            });
            if (reject) throw new Error('Synthetic owner receipt failed');
            return request;
          },
          { isolationLevel: 'Serializable' },
        );
      await expect(compose(true)).rejects.toThrow(
        'Synthetic owner receipt failed',
      );
      expect(await service.readRecovery(intent)).toMatchObject({
        attachment: 'preparing',
      });
      const before = await pool.query(
        `SELECT "config" FROM "${schema}"."content_runs" WHERE "id"=$1`,
        [intent.owner.runId],
      );
      expect(before.rows[0].config).toEqual({});
      const first = await compose(false);
      expect(await compose(false)).toEqual(first);
      expect(first.creditsConfig).toMatchObject({
        amount: 3,
        reservationId,
        settlement: 'completion',
        deferred: false,
        isByokBypass: false,
      });
      expect(await service.readRecovery(intent)).toMatchObject({
        attachment: 'attached',
      });
    });
    it('closure holding the real owner/reservation locks prevents attachment and keeps empty funding held', async () => {
      const intent = await prepare('closed');
      const reservationId = await requireHold(intent);
      let acquired = () => {};
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const releaseLock = new Promise<void>((resolve) => {
        release = resolve;
      });
      const closing = prisma.$transaction(async (tx) => {
        await lockedOwner(tx, intent);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "id"=${reservationId} AND "organizationId"='closed' AND "isDeleted"=false FOR UPDATE`,
        );
        const row = await tx.creditReservation.findFirstOrThrow({
          where: {
            id: reservationId,
            organizationId: 'closed',
            isDeleted: false,
          },
        });
        if (
          !row.metadata ||
          typeof row.metadata !== 'object' ||
          Array.isArray(row.metadata)
        )
          throw new Error('Synthetic metadata missing');
        await tx.creditReservation.updateMany({
          where: {
            id: reservationId,
            organizationId: 'closed',
            isDeleted: false,
          },
          data: { metadata: { ...row.metadata, dispatchClosed: true } },
        });
        acquired();
        await releaseLock;
      });
      await held;
      const attaching = prisma.$transaction(async (tx) => {
        await lockedOwner(tx, intent);
        return service.attachInTransaction(tx, { intent, reservationId });
      });
      const denied = expect(attaching).rejects.toThrow();
      release();
      await closing;
      await denied;
      await group.settleGroup(reservationId, 'closed');
      expect(credits.releaseReservation).not.toHaveBeenCalled();
      expect(credits.settleReservation).not.toHaveBeenCalled();
      expect(await service.readRecovery(intent)).toMatchObject({
        status: 'reserved',
        attachment: 'preparing',
        dispatchClosed: true,
      });
      expect(
        (
          await prisma.creditBalance.findFirstOrThrow({
            where: { organizationId: 'closed', isDeleted: false },
          })
        ).heldAmount,
      ).toBe(3);
    });
  },
);
