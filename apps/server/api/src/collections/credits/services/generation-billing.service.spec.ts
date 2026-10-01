import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  type GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { ICreditReservation } from '@genfeedai/contracts/interfaces/billing';
import type { LoggerService } from '@libs/logger/logger.service';

const NOW = new Date('2026-09-29T12:00:00Z');

function hold(overrides: Partial<ICreditReservation> = {}): ICreditReservation {
  return {
    actorUserId: 'user_1',
    amount: 4,
    billingAccountId: 'ba_1',
    createdAt: '2026-09-29T10:00:00.000Z',
    description: 'Avatar video generation',
    expiresAt: '2026-09-29T12:00:00.000Z',
    id: 'hold_1',
    idempotencyKey: 'media-generation:ing_1',
    isDeleted: false,
    metadata: { assetId: 'ing_1', marginMultiplier: 3.33 },
    organizationId: 'org_1',
    settledAmount: null,
    source: ActivitySource.VIDEO_GENERATION,
    status: CreditReservationStatus.RESERVED,
    updatedAt: '2026-09-29T10:00:00.000Z',
    workloadId: 'ing_1',
    workloadType: 'media-generation',
    ...overrides,
  };
}

describe('GenerationBillingService', () => {
  const credits = {
    bindReservationOutput: vi.fn(),
    findReservationForWorkload: vi.fn(),
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
  };
  const queue = { queueDeduction: vi.fn(), queueByokUsage: vi.fn() };
  const prisma = {
    crunGenerationTask: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    creditReservation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    ingredient: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    creditTransaction: { findFirst: vi.fn() },
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const quoteGroups = {
    reconcileOutput: vi.fn(),
    reconcile: vi.fn(),
    closeDispatch: vi.fn(),
    bindOutput: vi.fn(),
  };
  const service = new GenerationBillingService(
    credits as unknown as CreditsUtilsService,
    queue as unknown as CreditDeductionQueueService,
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
    quoteGroups as never,
  );

  const request = (
    overrides: Partial<
      NonNullable<GenerationBillingRequest['creditsConfig']>
    > = {},
  ): GenerationBillingRequest => ({
    creditsConfig: {
      amount: 8,
      description: 'Avatar video generation',
      reservationId: 'pool_1',
      settlement: 'completion',
      ...overrides,
    },
    user: {
      brandId: 'brand_1',
      id: 'user_1',
      organizationId: 'org_1',
      userId: 'user_1',
    },
  });

  beforeEach(() => {
    prisma.crunGenerationTask.findFirst.mockReset().mockResolvedValue(null);
    prisma.crunGenerationTask.findMany.mockReset().mockResolvedValue([]);
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (operation) =>
      operation(prisma),
    );
    prisma.crunGenerationTask.findFirst.mockResolvedValue(null);
    prisma.crunGenerationTask.findMany.mockResolvedValue([]);
    quoteGroups.reconcile.mockResolvedValue(0);
    quoteGroups.reconcileOutput.mockResolvedValue(false);
    credits.bindReservationOutput.mockResolvedValue(hold());
    credits.releaseReservation.mockResolvedValue(undefined);
    queue.queueDeduction.mockResolvedValue(undefined);
    queue.queueByokUsage.mockResolvedValue(undefined);
    prisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.findMany.mockResolvedValue([]);
    prisma.ingredient.findFirst.mockResolvedValue(null);
    prisma.creditTransaction.findFirst.mockResolvedValue(null);
  });

  it('recovers accepted identity without queuing an acceptance charge', async () => {
    await service.rememberAcceptedOutput({
      ingredientId: 'asset',
      externalId: 'provider-job',
      organizationId: 'org_1',
      userId: 'user_1',
    });
    expect(queue.queueDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 0,
        acceptedGeneration: {
          ingredientId: 'asset',
          externalId: 'provider-job',
        },
        idempotencyKey: 'media-generation-attach:asset',
      }),
    );
  });

  describe('hasPool', () => {
    it('is true only for a funded, completion-settled request hold', () => {
      expect(service.hasPool(request())).toBe(true);
      expect(service.hasPool(request({ settlement: undefined }))).toBe(false);
      expect(service.hasPool(request({ isByokBypass: true }))).toBe(false);
      expect(service.hasPool(request({ amount: 0 }))).toBe(false);
      expect(service.hasPool(request({ reservationId: undefined }))).toBe(
        false,
      );
    });
  });

  describe('bindOutput', () => {
    it('binds the accepted output to its share and counts it', async () => {
      const billing = request();

      await service.bindOutput(billing, { credits: 4, ingredientId: 'ing_1' });

      expect(credits.bindReservationOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4,
          metadata: { assetId: 'ing_1' },
          organizationId: 'org_1',
          reservationId: 'pool_1',
          workloadId: 'ing_1',
        }),
      );
      expect(billing.creditsConfig?.boundOutputCount).toBe(1);
    });

    it('links BYOK usage without reserving platform credits', async () => {
      await service.bindOutput(request({ isByokBypass: true }), {
        credits: 4,
        ingredientId: 'ing_1',
      });

      expect(credits.bindReservationOutput).not.toHaveBeenCalled();
      expect(prisma.ingredient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationBilling: expect.objectContaining({
              kind: 'byok',
              amount: 4,
              state: 'pending',
            }),
          }),
          where: expect.objectContaining({
            id: 'ing_1',
            organizationId: 'org_1',
            isDeleted: false,
          }),
        }),
      );
    });
  });

  describe('holdForService', () => {
    it('opens a pool that binds like a request hold', async () => {
      credits.reserveCredits.mockResolvedValue(hold({ id: 'pool_9' }));

      const billing = await service.holdForService({
        credits: 4,
        description: 'Avatar video generation',
        organizationId: 'org_1',
        source: ActivitySource.VIDEO_GENERATION,
        userId: 'user_1',
      });

      expect(credits.reserveCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4,
          organizationId: 'org_1',
          workloadType: 'generation',
        }),
      );
      expect(billing.creditsConfig?.reservationId).toBe('pool_9');
      expect(service.hasPool(billing)).toBe(true);
    });
  });

  describe('settleOutput', () => {
    it('queues one reserved settlement at the held amount', async () => {
      credits.findReservationForWorkload.mockResolvedValue(hold());

      const outcome = await service.settleOutput('ing_1', 'org_1');

      expect(outcome).toBe('queued');
      expect(queue.queueDeduction).toHaveBeenCalledWith({
        amount: 4,
        description: 'Avatar video generation',
        idempotencyKey: 'media-generation-settle:hold_1',
        metadata: { assetId: 'ing_1', marginMultiplier: 3.33 },
        organizationId: 'org_1',
        reservationId: 'hold_1',
        source: ActivitySource.VIDEO_GENERATION,
        type: 'deduct-credits',
        userId: 'user_1',
      });
    });

    it('keys a redelivered completion identically so the queue collapses it', async () => {
      credits.findReservationForWorkload.mockResolvedValue(hold());

      await service.settleOutput('ing_1', 'org_1');
      await service.settleOutput('ing_1', 'org_1');

      const keys = queue.queueDeduction.mock.calls.map(
        ([job]) => job.idempotencyKey,
      );
      expect(new Set(keys)).toEqual(
        new Set(['media-generation-settle:hold_1']),
      );
    });

    it('does not queue again once the hold is settled', async () => {
      credits.findReservationForWorkload.mockResolvedValue(
        hold({ settledAmount: 4, status: CreditReservationStatus.SETTLED }),
      );

      expect(await service.settleOutput('ing_1', 'org_1')).toBe(
        'already-settled',
      );
      expect(queue.queueDeduction).not.toHaveBeenCalled();
    });

    it('flags a completion that arrives after its hold was released', async () => {
      credits.findReservationForWorkload.mockResolvedValue(
        hold({ status: CreditReservationStatus.RELEASED }),
      );

      expect(await service.settleOutput('ing_1', 'org_1')).toBe('hold-ended');
      expect(queue.queueDeduction).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('after its credit hold ended'),
        expect.objectContaining({ ingredientId: 'ing_1' }),
      );
    });

    it('ignores an output that never had a hold (BYOK, external billing)', async () => {
      credits.findReservationForWorkload.mockResolvedValue(null);

      expect(await service.settleOutput('ing_1', 'org_1')).toBe('no-hold');
      expect(queue.queueDeduction).not.toHaveBeenCalled();
    });
  });

  describe('BYOK completion receipts', () => {
    const receipt = {
      kind: 'byok',
      amount: 4,
      description: 'Image generation',
      source: ActivitySource.IMAGE_GENERATION,
      state: 'pending',
      userId: 'user_1',
      expiresAt: '2026-09-29T12:00:00.000Z',
    };
    it('records completed usage with the same output key on duplicate delivery', async () => {
      credits.findReservationForWorkload.mockResolvedValue(null);
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'ing_1',
        status: IngredientStatus.GENERATED,
        generationBilling: receipt,
      });
      await service.settleOutput('ing_1', 'org_1');
      await service.settleOutput('ing_1', 'org_1');
      expect(queue.queueByokUsage).toHaveBeenCalledTimes(2);
      expect(queue.queueByokUsage.mock.calls[0][0]).toMatchObject({
        amount: 4,
        idempotencyKey: 'media-generation-usage:ing_1',
        organizationId: 'org_1',
        type: 'record-byok-usage',
      });
      expect(queue.queueDeduction).not.toHaveBeenCalled();
      expect(credits.reserveCredits).not.toHaveBeenCalled();
    });
    it('marks confirmed BYOK usage recorded without enqueueing again or changing wallet funding', async () => {
      credits.findReservationForWorkload.mockResolvedValue(null);
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'ing_1',
        status: IngredientStatus.GENERATED,
        generationBilling: receipt,
      });
      prisma.creditTransaction.findFirst.mockResolvedValue({ id: 'usage_1' });
      expect(await service.settleOutput('ing_1', 'org_1')).toBe(
        'already-settled',
      );
      expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          organizationId: 'org_1',
          isDeleted: false,
          idempotencyKey: 'byok:org_1:media-generation-usage:ing_1',
        },
      });
      expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
        data: { generationBilling: { ...receipt, state: 'recorded' } },
        where: {
          id: 'ing_1',
          organizationId: 'org_1',
          isDeleted: false,
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        },
      });
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'ing_1',
        status: IngredientStatus.GENERATED,
        generationBilling: { ...receipt, state: 'recorded' },
      });
      expect(await service.settleOutput('ing_1', 'org_1')).toBe(
        'already-settled',
      );
      expect(queue.queueByokUsage).not.toHaveBeenCalled();
      expect(queue.queueDeduction).not.toHaveBeenCalled();
      expect(credits.reserveCredits).not.toHaveBeenCalled();
      expect(credits.releaseReservation).not.toHaveBeenCalled();
    });
    it('retains failed-generation evidence without recording usage', async () => {
      credits.findReservationForWorkload.mockResolvedValue(null);
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'ing_1',
        status: IngredientStatus.FAILED,
        generationBilling: receipt,
      });
      await service.releaseOutput('ing_1', 'org_1');
      expect(queue.queueByokUsage).not.toHaveBeenCalled();
      expect(prisma.ingredient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationBilling: expect.objectContaining({ state: 'failed' }),
          }),
        }),
      );
    });
    it('keeps a completion receipt retryable if enqueue fails', async () => {
      credits.findReservationForWorkload.mockResolvedValue(null);
      prisma.ingredient.findFirst.mockResolvedValue({
        id: 'ing_1',
        status: IngredientStatus.GENERATED,
        generationBilling: receipt,
      });
      queue.queueByokUsage.mockRejectedValue(new Error('redis down'));
      await expect(service.settleOutput('ing_1', 'org_1')).rejects.toThrow(
        'redis down',
      );
      expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('releaseOutput', () => {
    it('releases an open hold without charging', async () => {
      credits.findReservationForWorkload.mockResolvedValue(hold());

      await service.releaseOutput('ing_1', 'org_1');

      expect(credits.releaseReservation).toHaveBeenCalledWith({
        organizationId: 'org_1',
        reason: 'release',
        reservationId: 'hold_1',
      });
      expect(queue.queueDeduction).not.toHaveBeenCalled();
    });

    it('leaves a settled hold alone', async () => {
      credits.findReservationForWorkload.mockResolvedValue(
        hold({ status: CreditReservationStatus.SETTLED }),
      );

      await service.releaseOutput('ing_1', 'org_1');

      expect(credits.releaseReservation).not.toHaveBeenCalled();
    });
  });

  describe('reconcile', () => {
    const row = (
      id: string,
      expiresAt = new Date(NOW.getTime() + 3_600_000),
    ) => ({
      createdAt: new Date('2026-09-29T10:00:00Z'),
      expiresAt,
      id: `hold_${id}`,
      organizationId: 'org_1',
      workloadId: id,
    });
    const ingredient = (id: string, status: IngredientStatus) => ({
      id,
      isDeleted: false,
      organizationId: 'org_1',
      status,
    });

    beforeEach(() => {
      credits.findReservationForWorkload.mockImplementation(
        async ({ workloadId }: { workloadId: string }) =>
          hold({ id: `hold_${workloadId}`, workloadId }),
      );
    });

    it.each(['expired', 'deleted', 'failed', 'missing'])(
      'retains a durable submission intent despite an unresolved %s library projection',
      async (state) => {
        prisma.creditReservation.findMany.mockResolvedValue([
          {
            ...row('intent', new Date(NOW.getTime() - 1)),
            metadata: {
              assetId: 'intent',
              submissionIntent: { version: 1, provider: 'heygen' },
            },
          },
        ]);
        prisma.ingredient.findMany.mockResolvedValue(
          state === 'missing'
            ? []
            : [
                {
                  ...ingredient(
                    'intent',
                    state === 'failed'
                      ? IngredientStatus.FAILED
                      : IngredientStatus.PROCESSING,
                  ),
                  isDeleted: state === 'deleted',
                },
              ],
        );
        expect(await service.reconcile(NOW)).toBe(0);
        expect(credits.releaseReservation).not.toHaveBeenCalled();
        expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
        expect(queue.queueDeduction).not.toHaveBeenCalled();
      },
    );

    it.each(['submission-rejected', 'provider-terminal'])(
      'recovers %s proof after its first release fails',
      async (kind) => {
        let metadata: Record<string, unknown> = {
          assetId: 'intent',
          submissionIntent: { version: 1, provider: 'heygen' },
        };
        prisma.$transaction.mockImplementation(async (operation) =>
          operation(prisma),
        );
        prisma.creditReservation.findFirst.mockImplementation(async () => ({
          id: 'hold_intent',
          status: CreditReservationStatus.RESERVED,
          metadata,
        }));
        prisma.creditReservation.updateMany.mockImplementation(
          async ({ data }) => {
            metadata = data.metadata;
            return { count: 1 };
          },
        );
        if (kind === 'submission-rejected')
          await service.recordSubmissionRejection('intent', 'org_1');
        else await service.recordProviderFailure('intent', 'org_1');
        expect(metadata).toMatchObject({
          confirmedFailure: {
            ingredientId: 'intent',
            provider: 'heygen',
            kind,
          },
        });
        credits.findReservationForWorkload.mockResolvedValue(
          hold({ id: 'hold_intent', workloadId: 'intent', metadata }),
        );
        credits.releaseReservation
          .mockRejectedValueOnce(new Error('Ledger unavailable'))
          .mockResolvedValue(undefined);
        await expect(service.releaseOutput('intent', 'org_1')).rejects.toThrow(
          'Ledger unavailable',
        );
        prisma.creditReservation.findMany.mockResolvedValue([
          { ...row('intent'), metadata },
        ]);
        prisma.ingredient.findMany.mockResolvedValue([
          ingredient('intent', IngredientStatus.FAILED),
        ]);
        expect(await service.reconcile(NOW)).toBe(1);
        expect(credits.releaseReservation).toHaveBeenLastCalledWith({
          organizationId: 'org_1',
          reservationId: 'hold_intent',
          expectedReservationMetadata: metadata,
        });
      },
    );

    it('settles finished output, releases failed output, and fails one that outlived its hold', async () => {
      prisma.creditReservation.findMany.mockResolvedValue([
        row('done'),
        row('failed'),
        row('gone'),
        row('stuck', new Date(NOW.getTime() - 1)),
        row('waiting'),
      ]);
      prisma.ingredient.findMany.mockResolvedValue([
        ingredient('done', IngredientStatus.GENERATED),
        ingredient('failed', IngredientStatus.FAILED),
        ingredient('stuck', IngredientStatus.PROCESSING),
        ingredient('waiting', IngredientStatus.PROCESSING),
      ]);

      const acted = await service.reconcile(NOW);

      expect(acted).toBe(4);
      expect(queue.queueDeduction).toHaveBeenCalledTimes(1);
      expect(queue.queueDeduction).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'hold_done' }),
      );
      expect(
        credits.releaseReservation.mock.calls.map(([input]) => input),
      ).toEqual([
        {
          organizationId: 'org_1',
          reason: 'release',
          reservationId: 'hold_failed',
        },
        {
          organizationId: 'org_1',
          reason: 'release',
          reservationId: 'hold_gone',
        },
        {
          organizationId: 'org_1',
          reason: 'expiry',
          reservationId: 'hold_stuck',
        },
      ]);
      expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
        data: { status: IngredientStatus.FAILED },
        where: {
          id: 'stuck',
          isDeleted: false,
          organizationId: 'org_1',
          status: IngredientStatus.PROCESSING,
        },
      });
    });

    it('settles a completion that wins the expiry status race rather than releasing its hold', async () => {
      prisma.creditReservation.findMany.mockResolvedValue([
        row('done', new Date(NOW.getTime() - 1)),
      ]);
      prisma.ingredient.findMany.mockResolvedValue([
        ingredient('done', IngredientStatus.PROCESSING),
      ]);
      prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });
      prisma.ingredient.findFirst.mockResolvedValue(
        ingredient('done', IngredientStatus.GENERATED),
      );
      await service.reconcile(NOW);
      expect(queue.queueDeduction).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'hold_done' }),
      );
      expect(credits.releaseReservation).not.toHaveBeenCalled();
    });

    it('scans past a full page of processing holds to reach a completed output', async () => {
      prisma.creditReservation.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 200 }, (_, i) => row(`waiting-${i}`)),
        )
        .mockResolvedValueOnce([row('done')]);
      prisma.ingredient.findMany
        .mockResolvedValueOnce(
          Array.from({ length: 200 }, (_, i) =>
            ingredient(`waiting-${i}`, IngredientStatus.PROCESSING),
          ),
        )
        .mockResolvedValueOnce([
          ingredient('done', IngredientStatus.GENERATED),
        ]);
      expect(await service.reconcile(NOW)).toBe(1);
      expect(queue.queueDeduction).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'hold_done' }),
      );
      expect(prisma.creditReservation.findMany).toHaveBeenCalledTimes(2);
    });

    it('keeps sweeping after one hold fails', async () => {
      prisma.creditReservation.findMany.mockResolvedValue([row('a'), row('b')]);
      prisma.ingredient.findMany.mockResolvedValue([
        ingredient('a', IngredientStatus.GENERATED),
        ingredient('b', IngredientStatus.GENERATED),
      ]);
      queue.queueDeduction.mockRejectedValueOnce(new Error('redis down'));

      const acted = await service.reconcile(NOW);

      expect(acted).toBe(1);
      expect(queue.queueDeduction).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalled();
    });
  });
  it.each(['submitting', 'pending', 'running', 'recovery-required'])(
    'keeps unresolved Crun %s funding despite local failure/TTL',
    async (state) => {
      prisma.crunGenerationTask.findFirst.mockResolvedValue({
        state,
        terminalReceipt: null,
        vendorCostRecordedAt: null,
        mediaPersistedAt: null,
        quoteSnapshot: {},
      });
      expect(await service.releaseOutput('ing_1', 'org_1')).toBe('held');
      expect(await service.settleOutput('ing_1', 'org_1')).toBe('held');
      await service.recordProviderFailure('ing_1', 'org_1');
      expect(credits.releaseReservation).not.toHaveBeenCalled();
      expect(queue.queueDeduction).not.toHaveBeenCalled();
      expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    },
  );
  it('rechecks Crun release proof inside Serializable status mutation and retries only a rolled-back conflict', async () => {
    prisma.crunGenerationTask.findFirst.mockResolvedValue({
      state: 'prepared',
      terminalReceipt: null,
    });
    prisma.ingredient.findFirst.mockResolvedValue({
      id: 'ing_1',
      status: IngredientStatus.PROCESSING,
      generationBilling: null,
    });
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await service.recordProviderFailure('ing_1', 'org_1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.ingredient.updateMany).toHaveBeenCalledTimes(1);
    expect(queue.queueDeduction).not.toHaveBeenCalled();
  });
  it('a submitting task cannot acquire negative proof from a local failure projection', async () => {
    prisma.crunGenerationTask.findFirst.mockResolvedValue({
      state: 'submitting',
      terminalReceipt: null,
    });
    await service.recordSubmissionRejection('ing_1', 'org_1');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(credits.releaseReservation).not.toHaveBeenCalled();
  });
});
