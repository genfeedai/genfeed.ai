import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { chargeBatchGenerationCredits } from '@genfeedai/constants';
import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    refundOrganizationCredits: ReturnType<typeof vi.fn>;
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
  }) {
    return {
      config: {
        credits: {
          chargedCredits: params.chargedCredits,
          refundedCredits: params.refundedCredits ?? 0,
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
    credits: { chargedCredits: number; refundedCredits: number };
    pricing: Record<string, unknown>;
  } {
    const call = batchDelegate.updateMany.mock.calls[callIndex];
    return call[0].data.config;
  }

  beforeEach(async () => {
    batchDelegate = {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      refundOrganizationCredits: vi.fn().mockResolvedValue(undefined),
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

  it('stays under-charged when the credit move itself fails', async () => {
    batchDelegate.findFirst.mockResolvedValue(batchWith({ chargedCredits: 0 }));
    creditsUtilsService.deductCreditsFromOrganization.mockRejectedValue(
      new Error('credits service unavailable'),
    );

    // The ledger is written before the move, so a failure must not bubble: a
    // caller that retried would bill the same drafts a second time.
    const settlement = await settle();

    expect(settlement.isAlreadySettled).toBe(false);
    expect(settlement.settledCredits).toBe(ONE_DRAFT);
    expect(batchDelegate.updateMany).toHaveBeenCalledOnce();
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
    });

    const config = writtenConfig();
    expect(config.credits.chargedCredits).toBe(10);
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
