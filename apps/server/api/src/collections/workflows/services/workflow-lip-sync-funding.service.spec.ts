import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { queueHoldSettlement } from '@api/collections/credits/services/generation-duration-settlement';
import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import type { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import { WorkflowLipSyncFundingService } from '@api/collections/workflows/services/workflow-lip-sync-funding.service';
import { photoAnimationSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ICreditReservation } from '@genfeedai/contracts/interfaces/billing';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const POOL = {
  creditsConfig: {
    amount: 65,
    reservationId: 'pool-1',
    settlement: 'completion' as const,
  },
  user: { id: 'user-1', organizationId: 'org-1' },
};

function lipSyncSnapshot(seconds: number) {
  const quote = quoteModelBillablePricing(
    billableProfile({
      cost: 0,
      key: 'sync/lipsync-2',
      pricingType: 'per-second',
      provider: 'replicate',
      providerCostUsd: 0.05,
    }),
    { duration: seconds, modelKey: 'sync/lipsync-2', provider: 'replicate' },
    3.33,
    '2026-10-14T00:00:00.000Z',
  );
  if (quote.status !== 'priced') throw new Error(quote.reason);
  return quote.snapshot;
}

describe('WorkflowLipSyncFundingService', () => {
  const holdForService = vi.fn();
  const bindOutput = vi.fn();
  const releaseOutput = vi.fn();
  const releasePool = vi.fn();
  const quoteSnapshotByKey = vi.fn();
  const findFirst = vi.fn();
  const resolveOrganizationConnection = vi.fn();
  const lookupApiKey = vi.fn();
  const generationBilling = {
    bindOutput,
    holdForService,
    releaseOutput,
    releasePool,
  } as unknown as GenerationBillingService;
  const modelQuotes = {
    quoteSnapshotByKey,
  } as unknown as ModelCreditQuoteService;
  const prisma = { ingredient: { findFirst } } as unknown as PrismaService;
  const logger = { error: vi.fn() } as unknown as LoggerService;
  const heygen = {
    resolveOrganizationConnection,
  } as unknown as HeyGenService;
  const byok = { lookupApiKey } as unknown as ByokService;
  const service = new WorkflowLipSyncFundingService(
    new AvatarVideoBillingService(
      {} as CreditsUtilsService,
      generationBilling,
      modelQuotes,
      logger,
      {} as AvatarVideoModelService,
      byok,
      heygen,
      prisma,
      {} as never,
      {} as never,
    ),
    generationBilling,
    modelQuotes,
    heygen,
    byok,
    prisma,
    logger,
  );
  const input = {
    audioIngredientId: 'voice-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    holdForService.mockResolvedValue(POOL);
    findFirst.mockResolvedValue({ metadata: { duration: 4.2 } });
    resolveOrganizationConnection.mockResolvedValue({
      apiKey: 'platform-key',
      binding: { kind: 'platform', organizationId: 'org-1' },
    });
    lookupApiKey.mockResolvedValue(undefined);
  });

  describe('photo animation', () => {
    beforeEach(() => {
      quoteSnapshotByKey.mockResolvedValue(photoAnimationSnapshot(5));
    });

    it('holds heygen/avatar at the measured voice length on the platform key', async () => {
      const funding = await service.fundPhotoAnimation(input);

      expect(resolveOrganizationConnection).toHaveBeenCalledTimes(1);
      expect(resolveOrganizationConnection).toHaveBeenCalledWith('org-1');
      expect(findFirst).toHaveBeenCalledWith({
        select: { metadata: { select: { duration: true } } },
        where: { id: 'voice-1', isDeleted: false, organizationId: 'org-1' },
      });
      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.HEYGEN_AVATAR,
        { duration: 5 },
      );
      expect(holdForService).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          credits: 65,
          organizationId: 'org-1',
          source: ActivitySource.VIDEO_GENERATION,
          userId: 'user-1',
        }),
      );
      expect(funding).toMatchObject({ apiKey: 'platform-key', isByok: false });
    });

    it('binds the output with the frozen quote that the HeyGen duration settles', async () => {
      const funding = await service.fundPhotoAnimation(input);

      await funding.bind('output-1');

      expect(bindOutput).toHaveBeenCalledWith(POOL, {
        credits: 65,
        ingredientId: 'output-1',
        metadata: {
          avatarDurationQuote: {
            estimatedSeconds: 5,
            snapshot: photoAnimationSnapshot(5),
          },
        },
        submissionIntentProvider: ByokProvider.HEYGEN,
      });
      // The webhook's 3-second clip settles the 5-second hold at 3 seconds.
      const queueDeduction = vi.fn();
      const bound = bindOutput.mock.calls[0]?.[1] as {
        credits: number;
        metadata: Record<string, unknown>;
      };
      await queueHoldSettlement(
        {
          logger: { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
          prisma,
          queue: { queueDeduction } as unknown as CreditDeductionQueueService,
        },
        {
          amount: bound.credits,
          id: 'hold-1',
          metadata: bound.metadata,
        } as unknown as ICreditReservation,
        { ingredientId: 'output-1', organizationId: 'org-1', userId: 'user-1' },
        { durationSeconds: 3 },
      );
      expect(queueDeduction).toHaveBeenCalledTimes(1);
      expect(queueDeduction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: photoAnimationSnapshot(3).credits,
          reservationId: 'hold-1',
        }),
      );
    });

    it('releases the output hold on rejection and the pool after dispatch', async () => {
      const funding = await service.fundPhotoAnimation(input);

      await funding.reject('output-1');
      await funding.releasePool();

      expect(releaseOutput).toHaveBeenCalledWith('output-1', 'org-1');
      expect(releasePool).toHaveBeenCalledWith(POOL);
    });

    it('holds nothing and dispatches with the customer key on a BYOK HeyGen connection', async () => {
      resolveOrganizationConnection.mockResolvedValue({
        apiKey: 'customer-key',
        binding: { kind: 'byok', organizationId: 'org-1' },
      });

      const funding = await service.fundPhotoAnimation(input);
      await funding.bind('output-1');
      await funding.reject('output-1');
      await funding.releasePool();

      expect(funding).toMatchObject({ apiKey: 'customer-key', isByok: true });
      expect(holdForService).not.toHaveBeenCalled();
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
      expect(bindOutput).not.toHaveBeenCalled();
      expect(releaseOutput).not.toHaveBeenCalled();
      expect(releasePool).not.toHaveBeenCalled();
    });

    it('refuses a voice with no measured length before holding', async () => {
      findFirst.mockResolvedValue({ metadata: { duration: null } });

      await expect(service.fundPhotoAnimation(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(holdForService).not.toHaveBeenCalled();
    });
  });

  describe('video lip-sync', () => {
    beforeEach(() => {
      quoteSnapshotByKey.mockResolvedValue(lipSyncSnapshot(5));
    });

    it('holds the lip-sync tariff at the measured voice length and binds a per-second quote', async () => {
      const funding = await service.fundVideoLipSync({
        ...input,
        model: 'sync/lipsync-2',
      });
      await funding.bind('output-1');

      expect(lookupApiKey).toHaveBeenCalledWith(
        'org-1',
        ByokProvider.REPLICATE,
      );
      expect(quoteSnapshotByKey).toHaveBeenCalledWith('sync/lipsync-2', {
        duration: 5,
        organizationId: 'org-1',
      });
      const credits = lipSyncSnapshot(5).credits;
      expect(holdForService).toHaveBeenCalledWith(
        expect.objectContaining({ credits, organizationId: 'org-1' }),
      );
      expect(bindOutput).toHaveBeenCalledWith(POOL, {
        credits,
        ingredientId: 'output-1',
        metadata: {
          avatarDurationQuote: {
            estimatedSeconds: 5,
            snapshot: lipSyncSnapshot(5),
          },
        },
        submissionIntentProvider: ByokProvider.REPLICATE,
      });
      // The platform Replicate key dispatches.
      expect(funding.apiKey).toBeUndefined();
      expect(funding.isByok).toBe(false);
    });

    it('dispatches on the customer Replicate key without a platform hold', async () => {
      lookupApiKey.mockResolvedValue({ apiKey: 'replicate-customer-key' });

      const funding = await service.fundVideoLipSync({
        ...input,
        model: 'sync/lipsync-2',
      });

      expect(funding).toMatchObject({
        apiKey: 'replicate-customer-key',
        isByok: true,
      });
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
      expect(holdForService).not.toHaveBeenCalled();
    });

    it('refuses an unpriced lip-sync model before holding or dispatching', async () => {
      quoteSnapshotByKey.mockRejectedValue(new Error('Pricing is unavailable'));

      await expect(
        service.fundVideoLipSync({ ...input, model: 'sync/lipsync-2' }),
      ).rejects.toThrow('Pricing is unavailable');
      expect(holdForService).not.toHaveBeenCalled();
    });
  });
});
