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
  const queue = { queueDeduction: vi.fn() };
  const prisma = {
    creditReservation: { findMany: vi.fn() },
    ingredient: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new GenerationBillingService(
    credits as unknown as CreditsUtilsService,
    queue as unknown as CreditDeductionQueueService,
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
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
    vi.resetAllMocks();
    credits.bindReservationOutput.mockResolvedValue(hold());
    credits.releaseReservation.mockResolvedValue(undefined);
    queue.queueDeduction.mockResolvedValue(undefined);
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

    it('does nothing when the request holds no platform credits', async () => {
      await service.bindOutput(request({ isByokBypass: true }), {
        credits: 4,
        ingredientId: 'ing_1',
      });

      expect(credits.bindReservationOutput).not.toHaveBeenCalled();
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
});
