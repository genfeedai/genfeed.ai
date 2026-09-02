import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { chargeBatchGenerationCredits } from '@genfeedai/constants';
import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

/** The rates a batch pins at creation — caption-first, no media generated. */
const PINNED_PRICING = { includeMedia: false, qualityTier: 'balanced' };

/** What one completed caption-only image draft costs at those rates. */
const ONE_DRAFT = chargeBatchGenerationCredits(
  [{ format: ContentFormat.IMAGE, hasMedia: false }],
  PINNED_PRICING,
);

const LEASE = new Date('2026-08-07T10:00:00.000Z');

/**
 * Settlement idempotency (#2501). A batch can now be settled from more than one
 * place — the run itself, a redelivered BullMQ job, a resumed run, the
 * reconciliation sweep — so each of these must move only what has not moved yet.
 */
describe('BatchGenerationCreditsService', () => {
  let service: BatchGenerationCreditsService;
  let batchDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    releaseReservation: ReturnType<typeof vi.fn>;
    refundOrganizationCredits: ReturnType<typeof vi.fn>;
    settleReservation: ReturnType<typeof vi.fn>;
  };

  const completedItem = {
    format: ContentFormat.IMAGE,
    id: 'item-1',
    platform: 'instagram',
    postId: 'post-1',
    status: BatchItemStatus.COMPLETED,
  };

  function batchWith(params: {
    chargedCredits: number;
    items?: Array<Record<string, unknown>>;
    refundedCredits?: number;
    reservationId?: string;
    reservationSettledAt?: string;
    settlementSeq?: number;
  }) {
    return {
      config: {
        credits: {
          chargedCredits: params.chargedCredits,
          refundedCredits: params.refundedCredits ?? 0,
          ...(params.settlementSeq
            ? { settlementSeq: params.settlementSeq }
            : {}),
          ...(params.reservationId
            ? { reservationId: params.reservationId }
            : {}),
          ...(params.reservationSettledAt
            ? { reservationSettledAt: params.reservationSettledAt }
            : {}),
        },
        pricing: PINNED_PRICING,
        totalCount: 2,
      },
      items: params.items ?? [completedItem],
      updatedAt: LEASE,
    };
  }

  function settle() {
    return service.settleBatchCredits({
      batchId: 'batch-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  }

  /** The batch config written by the compare-and-swap on `updateMany`. */
  function writtenConfig(callIndex = 0): {
    credits: {
      chargedCredits: number;
      refundedCredits: number;
      reservationId?: string;
      reservationSettledAt?: string;
    };
    pricing: Record<string, unknown>;
  } {
    const call = batchDelegate.updateMany.mock.calls[callIndex];
    return call[0].data.config;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    batchDelegate = {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      refundOrganizationCredits: vi.fn().mockResolvedValue(undefined),
      settleReservation: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchGenerationCreditsService,
        { provide: PrismaService, useValue: { batch: batchDelegate } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
      ],
    }).compile();

    service = module.get(BatchGenerationCreditsService);
  });

  it('bills the drafts that landed when nothing was charged up front', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 0 }));

    const settlement = await settle();

    expect(settlement.settledCredits).toBe(ONE_DRAFT);
    expect(settlement.additionalCredits).toBe(ONE_DRAFT);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledOnce();
  });

  it('settles a batch reservation to the price of only the drafts that landed', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({
        chargedCredits: ONE_DRAFT * 2,
        reservationId: 'reservation-1',
      }),
    );

    const settlement = await settle();

    expect(settlement.settledCredits).toBe(ONE_DRAFT);
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith({
      actualAmount: ONE_DRAFT,
      actorUserId: 'user-1',
      description: 'Batch generation batch-1 settlement',
      organizationId: 'org-1',
      reservationId: 'reservation-1',
      source: expect.anything(),
    });
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.refundOrganizationCredits,
    ).not.toHaveBeenCalled();
    expect(writtenConfig().credits).toMatchObject({
      chargedCredits: ONE_DRAFT,
      reservationId: 'reservation-1',
      reservationSettledAt: expect.any(String),
    });
  });

  it('settles the held estimate and collects media overage idempotently', async () => {
    const completedMediaItem = { ...completedItem, mediaUrl: 'media.jpg' };
    const landedCredits = chargeBatchGenerationCredits(
      [{ format: ContentFormat.IMAGE, hasMedia: true }],
      PINNED_PRICING,
    );
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({
        chargedCredits: ONE_DRAFT,
        items: [completedMediaItem],
        reservationId: 'reservation-1',
      }),
    );

    const settlement = await settle();

    expect(settlement).toMatchObject({
      additionalCredits: landedCredits - ONE_DRAFT,
      settledCredits: landedCredits,
    });
    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: ONE_DRAFT }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      landedCredits - ONE_DRAFT,
      expect.any(String),
      expect.anything(),
      expect.objectContaining({
        referenceId: 'batch-1:1',
        referenceType: 'batch-generation:settlement',
      }),
    );
    expect(writtenConfig().credits.chargedCredits).toBe(landedCredits);
  });

  it('releases the reservation when a batch produces no usable drafts', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({
        chargedCredits: ONE_DRAFT,
        items: [],
        reservationId: 'reservation-1',
      }),
    );

    const settlement = await settle();

    expect(settlement.settledCredits).toBe(0);
    expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
  });

  it('does not transition an already settled batch reservation twice', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({
        chargedCredits: ONE_DRAFT,
        reservationId: 'reservation-1',
        reservationSettledAt: '2026-08-28T00:00:00.000Z',
      }),
    );

    const settlement = await settle();

    expect(settlement.isAlreadySettled).toBe(true);
    expect(creditsUtilsService.settleReservation).not.toHaveBeenCalled();
    expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
    expect(batchDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('moves nothing when the batch is settled a second time', async () => {
    // The ledger already records the price of what landed — this is the state a
    // redelivered job or the reconcile sweep finds.
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({ chargedCredits: ONE_DRAFT }),
    );

    const replay = await settle();

    expect(replay.settledCredits).toBe(ONE_DRAFT);
    expect(replay.additionalCredits).toBe(0);
    expect(replay.refundCredits).toBe(0);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.refundOrganizationCredits,
    ).not.toHaveBeenCalled();
  });

  it('refunds the unused half of the estimate, and never refunds it twice', async () => {
    // Estimate covered two drafts; the API reload meant only one landed.
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({ chargedCredits: ONE_DRAFT * 2 }),
    );

    const first = await settle();

    expect(first.refundCredits).toBe(ONE_DRAFT);
    expect(
      creditsUtilsService.refundOrganizationCredits,
    ).toHaveBeenCalledOnce();

    const ledger = writtenConfig().credits;
    expect(ledger.chargedCredits).toBe(ONE_DRAFT);
    expect(ledger.refundedCredits).toBe(ONE_DRAFT);

    // A later sweep reads that ledger back and finds nothing owing.
    creditsUtilsService.refundOrganizationCredits.mockClear();
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({
        chargedCredits: ledger.chargedCredits,
        refundedCredits: ledger.refundedCredits,
      }),
    );

    const second = await settle();

    expect(second.refundCredits).toBe(0);
    expect(
      creditsUtilsService.refundOrganizationCredits,
    ).not.toHaveBeenCalled();
  });

  it('prices only the items that produced a draft', async () => {
    batchDelegate.findFirst.mockResolvedValue(
      batchWith({
        chargedCredits: 0,
        items: [
          completedItem,
          // Stranded by the reload — the customer got nothing for it.
          {
            format: ContentFormat.IMAGE,
            id: 'item-2',
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
          {
            format: ContentFormat.IMAGE,
            id: 'item-3',
            platform: 'instagram',
            status: BatchItemStatus.FAILED,
          },
          // Marked complete but no post persisted — nothing usable landed.
          {
            format: ContentFormat.IMAGE,
            id: 'item-4',
            platform: 'instagram',
            status: BatchItemStatus.COMPLETED,
          },
        ],
      }),
    );

    const settlement = await settle();

    expect(settlement.settledCredits).toBe(ONE_DRAFT);
  });

  it('claims the ledger against the row it read', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 0 }));

    await settle();

    expect(batchDelegate.updateMany.mock.calls[0]?.[0]?.where).toEqual(
      expect.objectContaining({
        id: 'batch-1',
        organizationId: 'org-1',
        updatedAt: LEASE,
      }),
    );
  });

  it('moves no credits when a concurrent settlement wins the swap', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 0 }));
    batchDelegate.updateMany.mockResolvedValue({ count: 0 });

    const settlement = await settle();

    expect(settlement.isAlreadySettled).toBe(true);
    expect(settlement.settledCredits).toBe(0);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.refundOrganizationCredits,
    ).not.toHaveBeenCalled();
  });

  it('persists and alerts on a settlement deduction shortfall', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 0 }));
    const deductionError = new Error('insufficient organization credits');
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      deductionError,
    );

    // The ledger is written before the move, so a failure must not bubble back
    // into settlement. Only the durable shortfall marker may drive a retry.
    const settlement = await settle();

    expect(settlement.isAlreadySettled).toBe(false);
    expect(settlement.settledCredits).toBe(ONE_DRAFT);
    expect(batchDelegate.updateMany).toHaveBeenCalledTimes(2);
    expect(batchDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      data: { settlementShortfall: ONE_DRAFT, settlementShortfallSeq: 1 },
      where: expect.objectContaining({
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'org-1',
        settlementShortfall: null,
      }),
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(deductionError, {
      extra: {
        batchId: 'batch-1',
        organizationId: 'org-1',
        settlementShortfall: ONE_DRAFT,
      },
      tags: {
        operation: 'batch-credit-settlement',
      },
    });
  });

  it('retries the exact marked shortfall and leaves the marker clear on success', async () => {
    await expect(
      service.retrySettlementShortfall({
        batchId: 'batch-1',
        organizationId: 'org-1',
        settlementShortfall: ONE_DRAFT,
        settlementShortfallSeq: 3,
        userId: 'user-1',
      }),
    ).resolves.toBe(true);

    // The claim negates the marker — a real state transition, not a no-op
    // write of the current value back onto itself.
    expect(batchDelegate.updateMany).toHaveBeenNthCalledWith(1, {
      data: { settlementShortfall: -ONE_DRAFT },
      where: expect.objectContaining({
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'org-1',
        settlementShortfall: ONE_DRAFT,
        settlementShortfallSeq: 3,
      }),
    });
    expect(batchDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      data: { settlementShortfall: null, settlementShortfallSeq: null },
      where: expect.objectContaining({
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'org-1',
        settlementShortfall: -ONE_DRAFT,
        settlementShortfallSeq: 3,
      }),
    });
    // The retry reuses the failing occurrence's reference, so a deduction that
    // actually committed before the original failure is a no-op here.
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      ONE_DRAFT,
      'Batch generation batch-1 settlement',
      expect.anything(),
      expect.objectContaining({
        referenceId: 'batch-1:3',
        referenceType: 'batch-generation:settlement',
      }),
    );
  });

  it('lets exactly one of two interleaved sweeps collect the shortfall', async () => {
    // Emulate the database row so updateMany behaves like a real guarded
    // write: the claim only matches while the marker is still positive.
    const row: {
      settlementShortfall: number | null;
      settlementShortfallSeq: number | null;
    } = { settlementShortfall: ONE_DRAFT, settlementShortfallSeq: 3 };

    batchDelegate.updateMany.mockImplementation(
      ({
        data,
        where,
      }: {
        data: Partial<typeof row>;
        where: Partial<typeof row>;
      }) => {
        const matches =
          (!('settlementShortfall' in where) ||
            row.settlementShortfall === where.settlementShortfall) &&
          (!('settlementShortfallSeq' in where) ||
            row.settlementShortfallSeq === where.settlementShortfallSeq);
        if (!matches) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      },
    );

    const retry = () =>
      service.retrySettlementShortfall({
        batchId: 'batch-1',
        organizationId: 'org-1',
        settlementShortfall: ONE_DRAFT,
        settlementShortfallSeq: 3,
        userId: 'user-1',
      });

    const [first, second] = await Promise.all([retry(), retry()]);

    // Exactly one sweep wins the claim; the loser moves nothing.
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledTimes(1);
    expect(row.settlementShortfall).toBeNull();
    expect(row.settlementShortfallSeq).toBeNull();
  });

  it('restores the marker for the next sweep when the retry deduction fails', async () => {
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new Error('insufficient organization credits'),
    );

    await expect(
      service.retrySettlementShortfall({
        batchId: 'batch-1',
        organizationId: 'org-1',
        settlementShortfall: ONE_DRAFT,
        settlementShortfallSeq: 3,
        userId: 'user-1',
      }),
    ).resolves.toBe(false);

    expect(batchDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      data: { settlementShortfall: ONE_DRAFT },
      where: expect.objectContaining({
        id: 'batch-1',
        organizationId: 'org-1',
        settlementShortfall: -ONE_DRAFT,
        settlementShortfallSeq: 3,
      }),
    });
  });

  it('does not retry a stale sweep result after its marker was cleared', async () => {
    batchDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.retrySettlementShortfall({
        batchId: 'batch-1',
        organizationId: 'org-1',
        settlementShortfall: ONE_DRAFT,
        settlementShortfallSeq: 3,
        userId: 'user-1',
      }),
    ).resolves.toBe(false);

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it('charges a later legitimate settlement delta under its own reference', async () => {
    // Occurrence 1: nothing charged up front, one draft landed.
    batchDelegate.findFirst.mockResolvedValueOnce(
      batchWith({ chargedCredits: 0 }),
    );
    await settle();

    // The batch resumes, a second draft lands, and the ledger carries the
    // first occurrence's claim. This delta is new money, not a replay.
    batchDelegate.findFirst.mockResolvedValueOnce(
      batchWith({
        chargedCredits: ONE_DRAFT,
        items: [
          completedItem,
          { ...completedItem, id: 'item-2', postId: 'post-2' },
        ],
        settlementSeq: 1,
      }),
    );
    const second = await settle();

    expect(second.additionalCredits).toBe(ONE_DRAFT);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenNthCalledWith(
      1,
      'org-1',
      'user-1',
      ONE_DRAFT,
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ referenceId: 'batch-1:1' }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'user-1',
      ONE_DRAFT,
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ referenceId: 'batch-1:2' }),
    );
  });

  it('never overwrites an earlier uncollected shortfall marker', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 0 }));
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new Error('insufficient organization credits'),
    );
    // The ledger claim succeeds, but the marker slot is occupied by an earlier
    // uncollected shortfall, so the guarded update matches nothing.
    batchDelegate.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await settle();

    const markerCall = batchDelegate.updateMany.mock.calls[1][0];
    expect(markerCall.where).toMatchObject({ settlementShortfall: null });
    // One capture for the failed deduction, one for the untracked shortfall.
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('returns without moving credits when the batch is gone', async () => {
    batchDelegate.findFirst.mockResolvedValue(null);

    const settlement = await settle();

    expect(settlement).toEqual({
      additionalCredits: 0,
      isAlreadySettled: true,
      refundCredits: 0,
      settledCredits: 0,
    });
    expect(batchDelegate.updateMany).not.toHaveBeenCalled();
  });

  it('accumulates an up-front charge on the ledger and pins the pricing', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 4 }));

    await service.recordUpfrontCharge({
      batchId: 'batch-1',
      credits: 6,
      organizationId: 'org-1',
      pricingOptions: { includeMedia: false, qualityTier: 'high_quality' },
      reservationId: 'reservation-1',
    });

    const config = writtenConfig();
    expect(config.credits.chargedCredits).toBe(10);
    expect(config.credits.reservationId).toBe('reservation-1');
    expect(config.pricing).toEqual({
      includeMedia: false,
      qualityTier: 'high_quality',
    });
    expect(batchDelegate.updateMany.mock.calls[0]?.[0]?.where).toEqual(
      expect.objectContaining({
        id: 'batch-1',
        organizationId: 'org-1',
        updatedAt: LEASE,
      }),
    );
  });

  it('keeps the pinned pricing when recording a charge without options', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 2 }));

    await service.recordUpfrontCharge({
      batchId: 'batch-1',
      credits: 3,
      organizationId: 'org-1',
    });

    const config = writtenConfig();
    expect(config.credits.chargedCredits).toBe(5);
    expect(config.pricing).toEqual(PINNED_PRICING);
  });
});
