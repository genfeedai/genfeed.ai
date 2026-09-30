import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import type { CreditDeductionJobData } from '@genfeedai/contracts/queue';
import { CreditDeductionProcessor } from '@workers/processors/api/queues/credit-deduction/credit-deduction.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * End-to-end regression for the settle-on-completion contract (#5657): the
 * real billing service and the real credit-deduction worker run against an
 * in-memory ledger, so the assertions are about the wallet, not call shapes.
 */
interface Hold {
  amount: number;
  id: string;
  status: CreditReservationStatus;
  workloadId: string;
}

const ORG = 'org-1';

describe('async generation settlement', () => {
  let holds: Map<string, Hold>;
  let transactions: Array<{ amount: number; reservationId: string }>;
  let released: string[];
  let jobs: Map<string, CreditDeductionJobData>;
  let billing: GenerationBillingService;
  let processor: CreditDeductionProcessor;
  let ingredients: Array<{
    id: string;
    isDeleted: boolean;
    organizationId: string;
    status: string;
  }>;

  const bind = (ingredientId: string, amount: number) => {
    const hold: Hold = {
      amount,
      id: `hold-${ingredientId}`,
      status: CreditReservationStatus.RESERVED,
      workloadId: ingredientId,
    };
    holds.set(ingredientId, hold);
    ingredients.push({
      id: ingredientId,
      isDeleted: false,
      organizationId: ORG,
      status: 'PROCESSING',
    });
  };

  const runQueuedJobs = async () => {
    for (const data of jobs.values()) {
      await processor.process({
        attemptsMade: 0,
        data,
        id: 'job',
        opts: { attempts: 3 },
      } as unknown as Job<CreditDeductionJobData>);
    }
  };

  beforeEach(() => {
    holds = new Map();
    transactions = [];
    released = [];
    jobs = new Map();
    ingredients = [];

    const toReservation = (hold: Hold) => ({
      actorUserId: 'user-1',
      amount: hold.amount,
      description: 'Avatar video generation',
      id: hold.id,
      metadata: { assetId: hold.workloadId },
      organizationId: ORG,
      source: ActivitySource.VIDEO_GENERATION,
      status: hold.status,
      workloadId: hold.workloadId,
      workloadType: 'media-generation',
    });
    const holdById = (id: string) =>
      [...holds.values()].find((entry) => entry.id === id);

    // The ledger mirrors CreditReservationService: settle and release are
    // single-shot transitions out of RESERVED, and settle writes the one
    // CreditTransaction.
    const creditsUtils = {
      findReservationForWorkload: vi.fn(
        async ({ workloadId }: { workloadId: string }) => {
          const hold = holds.get(workloadId);
          return hold ? toReservation(hold) : null;
        },
      ),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(5000),
      releaseReservation: vi.fn(
        async ({ reservationId }: { reservationId: string }) => {
          const hold = holdById(reservationId);
          if (hold?.status === CreditReservationStatus.RESERVED) {
            hold.status = CreditReservationStatus.RELEASED;
            released.push(reservationId);
          }
        },
      ),
      settleReservation: vi.fn(
        async ({
          actualAmount,
          reservationId,
        }: {
          actualAmount: number;
          reservationId: string;
        }) => {
          const hold = holdById(reservationId);
          if (!hold) throw new Error('missing hold');
          if (hold.status === CreditReservationStatus.SETTLED) return;
          if (hold.status !== CreditReservationStatus.RESERVED) {
            throw new Error(`unsettleable: ${hold.status}`);
          }
          hold.status = CreditReservationStatus.SETTLED;
          transactions.push({ amount: actualAmount, reservationId });
        },
      ),
    };

    // BullMQ collapses jobs that share a jobId.
    const queue = {
      queueDeduction: vi.fn(async (data: CreditDeductionJobData) => {
        const jobId = `${data.organizationId}-${data.idempotencyKey}`;
        if (!jobs.has(jobId)) jobs.set(jobId, data);
      }),
    };
    const prisma = {
      creditReservation: {
        findMany: vi.fn(async () =>
          [...holds.values()]
            .filter((hold) => hold.status === CreditReservationStatus.RESERVED)
            .map((hold) => ({
              createdAt: new Date('2026-09-29T00:00:00Z'),
              expiresAt: new Date('2099-01-01T00:00:00Z'),
              id: hold.id,
              organizationId: ORG,
              workloadId: hold.workloadId,
            })),
        ),
      },
      ingredient: {
        findMany: vi.fn(async () => ingredients),
        updateMany: vi.fn(),
      },
      workflowExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    billing = new GenerationBillingService(
      creditsUtils as never,
      queue as never,
      prisma as never,
      logger as never,
      {
        reconcile: vi.fn().mockResolvedValue(0),
        reconcileOutput: vi.fn().mockResolvedValue(false),
      } as never,
    );
    processor = new CreditDeductionProcessor(
      creditsUtils as never,
      { createTransactionEntry: vi.fn() } as never,
      { record: vi.fn().mockResolvedValue({ id: 'activity' }) } as never,
      {
        getPublisher: vi.fn().mockReturnValue({ set: vi.fn() }),
      } as never,
      logger as never,
      prisma as never,
    );
  });

  it('charges exactly once when the completion is delivered by webhook and poll', async () => {
    bind('ing-1', 4);

    await billing.settleOutput('ing-1', ORG);
    await billing.settleOutput('ing-1', ORG);
    await runQueuedJobs();
    await billing.settleOutput('ing-1', ORG);
    await runQueuedJobs();

    expect(transactions).toEqual([{ amount: 4, reservationId: 'hold-ing-1' }]);
    expect(released).toEqual([]);
  });

  it('releases without a charge when the provider fails after accepting the job', async () => {
    bind('ing-1', 4);

    await billing.releaseOutput('ing-1', ORG);
    await billing.releaseOutput('ing-1', ORG);
    await runQueuedJobs();

    expect(transactions).toEqual([]);
    expect(released).toEqual(['hold-ing-1']);
  });

  it('keeps one charge per output of a multi-output generation', async () => {
    bind('ing-1', 7);
    bind('ing-2', 7);
    bind('ing-3', 7);

    await billing.settleOutput('ing-1', ORG);
    await billing.releaseOutput('ing-2', ORG);
    await billing.settleOutput('ing-3', ORG);
    await runQueuedJobs();

    expect(transactions.map((entry) => entry.reservationId).sort()).toEqual([
      'hold-ing-1',
      'hold-ing-3',
    ]);
    expect(transactions.reduce((sum, entry) => sum + entry.amount, 0)).toBe(14);
    expect(released).toEqual(['hold-ing-2']);
  });

  it('does not double-charge when the sweep also sees a finished output', async () => {
    bind('ing-1', 4);
    ingredients[0].status = 'GENERATED';

    await billing.settleOutput('ing-1', ORG);
    await billing.reconcile(new Date('2026-09-29T12:00:00Z'));
    await runQueuedJobs();
    await billing.reconcile(new Date('2026-09-29T12:10:00Z'));
    await runQueuedJobs();

    expect(transactions).toHaveLength(1);
  });

  it('lets the sweep settle a finished output whose hook never fired', async () => {
    bind('ing-1', 4);
    ingredients[0].status = 'GENERATED';

    await billing.reconcile(new Date('2026-09-29T12:00:00Z'));
    await runQueuedJobs();

    expect(transactions).toEqual([{ amount: 4, reservationId: 'hold-ing-1' }]);
  });

  it('lets the sweep release a failed output whose hook never fired', async () => {
    bind('ing-1', 4);
    ingredients[0].status = 'FAILED';

    await billing.reconcile(new Date('2026-09-29T12:00:00Z'));
    await runQueuedJobs();

    expect(transactions).toEqual([]);
    expect(released).toEqual(['hold-ing-1']);
  });
});
