import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { seedReviewedProviderRates } from '@api/seeds/reviewed-provider-rates-seed';
import { ReplicateVideoBuilder } from '@api/services/prompt-builder/builders/replicate/replicate-video.builder';
import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  applyMargin,
  REVIEWED_RATE_SHEET_ENTRIES,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST;
const MARGIN = 3.33;
const FIRST_FRAME = 'https://cdn.example.com/first-frame.jpg';

/**
 * Real dispatch regression (#6196, #6174): the Hailuo 2.3 Fast request goes
 * through the real prompt builder and the real admission service against the
 * contract the rate sheet seeds, and charges applyMargin($0.19) once.
 */
describe('VideoGenerationCreditsService admission for minimax/hailuo-2.3-fast', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn(),
    reserveCredits: vi.fn(),
  };
  const byokService = { resolveApiKey: vi.fn().mockResolvedValue(undefined) };
  const builder = new ReplicateVideoBuilder({
    get: vi.fn(),
    isDevelopment: false,
  } as unknown as ConfigService);

  async function service() {
    const entry = REVIEWED_RATE_SHEET_ENTRIES.find(
      (candidate) => candidate.endpoint === KEY,
    );
    if (!entry) throw new Error('The sheet must carry hailuo-2.3-fast');
    const row = {
      endpoint: KEY,
      hasAudioToggle: false,
      hasResolutionOptions: false,
      id: 'model-1',
      isFree: false,
      key: KEY,
      provider: 'replicate',
      providerInputSchema: {
        properties: {
          duration: { enum: [6, 10] },
          resolution: { enum: ['768P', '1080P'] },
        },
      },
      reviewedProviderContractVersion: null,
    };
    const upsert = vi.fn().mockResolvedValue({});
    await seedReviewedProviderRates(
      {
        model: {
          findFirst: vi.fn().mockResolvedValue(row),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        modelProviderContract: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert,
        },
      } as never,
      [entry],
    );
    const create = upsert.mock.calls[0]?.[0].create;
    const profile = projectModelBillablePricingProfile(
      {
        ...row,
        cost: 0,
        costPerUnit: null,
        isActive: true,
        isDeleted: false,
        minCost: null,
        pendingProviderContractVersion: null,
        pricingType: 'flat',
        providerCostUsd: null,
        reviewedProviderContractVersion: create.version,
      } as never,
      [
        {
          ...create,
          discoveredAt: new Date(create.discoveredAt),
          lastSeenAt: new Date(create.lastSeenAt),
        },
      ],
    );
    const modelsService = {
      findBillablePricingProfile: vi.fn().mockResolvedValue(profile),
      findOne: vi.fn().mockResolvedValue({ key: KEY, provider: 'replicate' }),
    };
    return new VideoGenerationCreditsService(
      creditsUtilsService as never,
      modelsService as never,
      byokService as never,
      new ModelCreditQuoteService(modelsService as never),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(MARGIN);
  });

  it.each(['768P', '768p'])(
    'charges applyMargin(0.19) for a start frame at %s, user duration 5 (provider 6)',
    async (resolution) => {
      const providerInput = builder.buildPrompt(
        KEY,
        {
          duration: 5,
          height: 1080,
          modelCategory: ModelCategory.VIDEO,
          prompt: 'A cinematic product reveal',
          references: [FIRST_FRAME],
          resolution,
          width: 1920,
        },
        'A cinematic product reveal',
      );
      const request = { creditsConfig: { deferred: true } };

      await (await service()).ensureDeferredCredits(
        {
          duration: 5,
          height: 1080,
          outputs: 1,
          resolution,
          width: 1920,
        },
        KEY,
        'org-1',
        request as never,
        providerInput as unknown as Record<string, unknown>,
      );

      expect(providerInput).toMatchObject({ duration: 6, resolution: '768P' });
      expect(request.creditsConfig).toMatchObject({
        amount: applyMargin(0.19, MARGIN),
        deferred: false,
        modelKey: KEY,
      });
    },
  );
});
