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
import type { QueuedCreditChargeData } from '@genfeedai/contracts/queue';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface PoolRequest {
  creditsConfig: { amount: number; reservationId: string; settlement: string };
  user: { id: string; organizationId: string };
}

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

// The priced tariffs, each quoted at a duration.
const TARIFFS: Record<string, (seconds: number) => unknown> = {
  [MODEL_KEYS.HEYGEN_AVATAR]: photoAnimationSnapshot,
  'sync/lipsync-2': lipSyncSnapshot,
};

const input = {
  audioIngredientId: 'voice-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('WorkflowLipSyncFundingService', () => {
  // The saved voices, the connected keys, and the wallet's holds.
  let voices: Row[];
  let heygenConnection: { apiKey: string; binding: { kind: string } };
  let replicateKeys: Record<string, { apiKey: string }>;
  let pools: Row[];
  let boundOutputs: Row[];
  let releasedOutputs: string[];
  let releasedPools: string[];
  let errors: string[];
  let isWalletDown: boolean;
  let prisma: PrismaService;
  let service: WorkflowLipSyncFundingService;

  beforeEach(() => {
    voices = [
      {
        id: 'voice-1',
        isDeleted: false,
        metadata: { duration: 4.2 },
        organizationId: 'org-1',
      },
    ];
    heygenConnection = {
      apiKey: 'platform-key',
      binding: { kind: 'platform' },
    };
    replicateKeys = {};
    pools = [];
    boundOutputs = [];
    releasedOutputs = [];
    releasedPools = [];
    errors = [];
    isWalletDown = false;

    prisma = {
      ingredient: {
        findFirst: async ({ where }: { where: Row }) =>
          voices.find(
            (voice) =>
              voice.id === where.id &&
              voice.organizationId === where.organizationId &&
              voice.isDeleted === where.isDeleted,
          ) ?? null,
      },
    } as unknown as PrismaService;
    const generationBilling = {
      bindOutput: async (request: PoolRequest, binding: Row) => {
        boundOutputs.push({
          ...binding,
          pool: request.creditsConfig.reservationId,
        });
      },
      holdForService: async (hold: Row): Promise<PoolRequest> => {
        pools.push(hold);
        return {
          creditsConfig: {
            amount: Number(hold.credits),
            reservationId: `pool-${pools.length}`,
            settlement: 'completion',
          },
          user: { id: String(hold.userId), organizationId: 'org-1' },
        };
      },
      releaseOutput: async (ingredientId: string) => {
        if (isWalletDown) throw new Error('wallet unavailable');
        releasedOutputs.push(ingredientId);
      },
      releasePool: async (request: PoolRequest) => {
        releasedPools.push(request.creditsConfig.reservationId);
      },
    } as unknown as GenerationBillingService;
    const modelQuotes = {
      quoteSnapshotByKey: async (
        key: string,
        { duration }: { duration: number },
      ) => {
        const tariff = TARIFFS[key];
        if (!tariff) throw new Error('Pricing is unavailable');
        return tariff(duration);
      },
    } as unknown as ModelCreditQuoteService;
    const logger = {
      error: (message: string) => {
        errors.push(message);
      },
    } as unknown as LoggerService;
    const heygen = {
      resolveOrganizationConnection: async () => heygenConnection,
    } as unknown as HeyGenService;
    const byok = {
      lookupApiKey: async (_organizationId: string, provider: string) =>
        replicateKeys[provider],
    } as unknown as ByokService;

    service = new WorkflowLipSyncFundingService(
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
  });

  describe('photo animation', () => {
    it('holds heygen/avatar at the measured voice length, rounded up, on the platform key', async () => {
      const funding = await service.fundPhotoAnimation(input);

      expect(pools).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          credits: 65,
          organizationId: 'org-1',
          source: ActivitySource.VIDEO_GENERATION,
          userId: 'user-1',
        }),
      ]);
      expect(funding).toMatchObject({ apiKey: 'platform-key', isByok: false });
    });

    it('binds the output with the frozen quote, which settles to the clip HeyGen returns', async () => {
      const funding = await service.fundPhotoAnimation(input);

      await funding.bind('output-1');

      expect(boundOutputs).toEqual([
        {
          credits: 65,
          ingredientId: 'output-1',
          metadata: {
            avatarDurationQuote: {
              estimatedSeconds: 5,
              snapshot: photoAnimationSnapshot(5),
            },
          },
          pool: 'pool-1',
          submissionIntentProvider: ByokProvider.HEYGEN,
        },
      ]);

      // HeyGen's 3-second clip settles the 5-second hold at 3 seconds.
      const settlements: QueuedCreditChargeData[] = [];
      await queueHoldSettlement(
        {
          logger: {
            log: () => undefined,
            warn: () => undefined,
          } as unknown as LoggerService,
          prisma,
          queue: {
            queueDeduction: async (charge: QueuedCreditChargeData) => {
              settlements.push(charge);
            },
          } as unknown as CreditDeductionQueueService,
        },
        {
          amount: boundOutputs[0]?.credits,
          id: 'hold-1',
          metadata: boundOutputs[0]?.metadata,
        } as unknown as ICreditReservation,
        { ingredientId: 'output-1', organizationId: 'org-1', userId: 'user-1' },
        { durationSeconds: 3 },
      );
      expect(settlements).toEqual([
        expect.objectContaining({
          amount: photoAnimationSnapshot(3).credits,
          reservationId: 'hold-1',
        }),
      ]);
    });

    it('releases the output hold on rejection and the pool after dispatch', async () => {
      const funding = await service.fundPhotoAnimation(input);

      await funding.reject('output-1');
      await funding.releasePool();

      expect(releasedOutputs).toEqual(['output-1']);
      expect(releasedPools).toEqual(['pool-1']);
    });

    it('logs a failed output release without failing the node', async () => {
      const funding = await service.fundPhotoAnimation(input);
      isWalletDown = true;

      await expect(funding.reject('output-1')).resolves.toBeUndefined();

      expect(errors).toEqual([
        'AvatarVideoBillingService generation hold release failed',
      ]);
    });

    it('holds nothing and dispatches with the customer key on a BYOK HeyGen connection', async () => {
      heygenConnection = { apiKey: 'customer-key', binding: { kind: 'byok' } };

      const funding = await service.fundPhotoAnimation(input);
      await funding.bind('output-1');
      await funding.reject('output-1');
      await funding.releasePool();

      expect(funding).toMatchObject({ apiKey: 'customer-key', isByok: true });
      expect(pools).toEqual([]);
      expect(boundOutputs).toEqual([]);
      expect(releasedOutputs).toEqual([]);
      expect(releasedPools).toEqual([]);
    });

    it.each([
      ['has no measured length', { metadata: { duration: null } }],
      ['belongs to another organization', { organizationId: 'org-2' }],
    ])('refuses a voice that %s before holding', async (_case, fields) => {
      voices[0] = { ...voices[0], ...fields };

      await expect(service.fundPhotoAnimation(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pools).toEqual([]);
    });
  });

  describe('video lip-sync', () => {
    const lipSync = { ...input, model: 'sync/lipsync-2' };

    it('holds the lip-sync tariff at the measured length and binds a per-second quote', async () => {
      const funding = await service.fundVideoLipSync(lipSync);
      await funding.bind('output-1');

      expect(pools).toEqual([
        expect.objectContaining({
          credits: lipSyncSnapshot(5).credits,
          description: 'Workflow lip-sync video generation - sync/lipsync-2',
          organizationId: 'org-1',
        }),
      ]);
      expect(boundOutputs).toEqual([
        {
          credits: lipSyncSnapshot(5).credits,
          ingredientId: 'output-1',
          metadata: {
            avatarDurationQuote: {
              estimatedSeconds: 5,
              snapshot: lipSyncSnapshot(5),
            },
          },
          pool: 'pool-1',
          submissionIntentProvider: ByokProvider.REPLICATE,
        },
      ]);
      // The platform Replicate key dispatches.
      expect(funding.apiKey).toBeUndefined();
      expect(funding.isByok).toBe(false);
    });

    it('releases the output hold on rejection and the pool after dispatch', async () => {
      const funding = await service.fundVideoLipSync(lipSync);

      await funding.reject('output-1');
      await funding.releasePool();

      expect(releasedOutputs).toEqual(['output-1']);
      expect(releasedPools).toEqual(['pool-1']);
    });

    it('logs a failed output release without failing the node', async () => {
      const funding = await service.fundVideoLipSync(lipSync);
      isWalletDown = true;

      await expect(funding.reject('output-1')).resolves.toBeUndefined();

      expect(errors).toEqual([
        'WorkflowLipSyncFundingService output hold release failed',
      ]);
    });

    it('dispatches on the customer Replicate key without a platform hold', async () => {
      replicateKeys[ByokProvider.REPLICATE] = {
        apiKey: 'replicate-customer-key',
      };

      const funding = await service.fundVideoLipSync(lipSync);
      await funding.bind('output-1');
      await funding.releasePool();

      expect(funding).toMatchObject({
        apiKey: 'replicate-customer-key',
        isByok: true,
      });
      expect(pools).toEqual([]);
      expect(boundOutputs).toEqual([]);
    });

    it.each([
      [
        'an unpriced model',
        { model: 'unknown/model' },
        'Pricing is unavailable',
      ],
      [
        'a voice with no measured length',
        { audioIngredientId: 'voice-missing' },
        'Add a saved narration with a known length to price this lip-sync.',
      ],
    ])('refuses %s before holding', async (_case, fields, message) => {
      await expect(
        service.fundVideoLipSync({ ...lipSync, ...fields }),
      ).rejects.toThrow(message);
      expect(pools).toEqual([]);
    });
  });
});
