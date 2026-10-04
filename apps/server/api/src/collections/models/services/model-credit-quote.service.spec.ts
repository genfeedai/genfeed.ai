import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { ReplicateVideoBuilder } from '@api/services/prompt-builder/builders/replicate/replicate-video.builder';
import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ModelCreditQuoteService', () => {
  const modelsService = { findBillablePricingProfile: vi.fn() };
  const service = new ModelCreditQuoteService(modelsService as never);
  beforeEach(() =>
    modelsService.findBillablePricingProfile.mockResolvedValue(
      billableProfile(),
    ),
  );

  it('preserves exact versioned identity and organization during raw tariff lookup', async () => {
    modelsService.findBillablePricingProfile.mockResolvedValue(
      billableProfile({ key: 'owner/model:version', cost: 12 }),
    );
    await expect(
      service.quoteByKey('owner/model:version', { organizationId: 'org-1' }),
    ).resolves.toBe(12);
    expect(modelsService.findBillablePricingProfile).toHaveBeenCalledWith(
      'owner/model:version',
      'org-1',
    );
  });

  it.each([
    null,
    billableProfile({ isActive: false }),
    billableProfile({ cost: 0 }),
    billableProfile({ hasPendingRate: true }),
  ])(
    'refuses absent, inactive, unpriced or pending tariffs',
    async (profile) => {
      modelsService.findBillablePricingProfile.mockResolvedValue(profile);
      await expect(service.quoteByKey('test/model')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('names the model and pricing reason in the exception message', async () => {
    modelsService.findBillablePricingProfile.mockResolvedValue(
      billableProfile({ hasPendingRate: true }),
    );
    await expect(service.quoteByKey('test/model')).rejects.toMatchObject({
      message:
        'Pricing is unavailable for test/model: Pending provider rate requires review',
      response: { code: 'PRICING_UNAVAILABLE', modelKey: 'test/model' },
    });
  });

  it('rejects a tariff from a different dispatched provider', async () => {
    await expect(
      service.quoteByKey('test/model', { provider: 'heygen' }),
    ).rejects.toThrow();
  });

  it('requires actual seconds and rounds the aggregate once', async () => {
    modelsService.findBillablePricingProfile.mockResolvedValue(
      billableProfile({ pricingType: 'per-second', costPerUnit: 1.5 }),
    );
    await expect(service.quoteByKey('test/model')).rejects.toThrow();
    const quote = await service.quoteSnapshotByKey('test/model', {
      duration: 1,
      outputs: 3,
      requests: 3,
    });
    expect(quote.credits).toBe(5);
    expect(quote.allocatedCredits).toEqual([2, 2, 1]);
    expect(quote.quantities).toMatchObject({
      duration: 1,
      outputs: 3,
      requests: 3,
    });
    expect(quote.pricingProfile.costPerUnit).toBe(1.5);
  });
  it('freezes actual prepared duration and tariff selectors while excluding prompts and credentials', async () => {
    modelsService.findBillablePricingProfile.mockResolvedValue(
      billableProfile({
        pricingType: 'per-second',
        costPerUnit: 2,
        requiredSelectorKeys: ['resolution', 'audio'],
        reviewedPricing: {
          currency: 'USD',
          sourceUrl: 'https://example.test/rates',
          verifiedAt: '2026-09-30T00:00:00.000Z',
          reviewStatus: 'approved',
          version: 'v1',
          rates: [
            {
              component: 'video',
              unit: 'second',
              unitPriceUsd: 0.2,
              when: { resolution: '4k', audio: true },
              isPerOutput: true,
            },
          ],
        },
        rateVersion: 'v1',
        requiresReviewedRates: true,
      }),
    );
    const quote = await service.quoteSnapshotByKey('test/model', {
      duration: 5,
      outputs: 1,
      requests: 1,
      selectors: { resolution: '720p', audio: false },
      providerInput: {
        duration: 8,
        resolution: '4k',
        generate_audio: true,
        prompt: 'private prompt',
        apiKey: 'secret',
      },
    });
    expect(quote.quantities).toMatchObject({
      duration: 8,
      selectors: { resolution: '4k', audio: true },
    });
    expect(JSON.stringify(quote)).not.toContain('private prompt');
    expect(JSON.stringify(quote)).not.toContain('secret');
  });
  it.each([
    [7, 8],
    [5, 4],
  ])(
    'quotes Sora prepared seconds for request %s as %s',
    async (requested, seconds) => {
      const modelKey = MODEL_KEYS.REPLICATE_OPENAI_SORA_2;
      modelsService.findBillablePricingProfile.mockResolvedValue(
        billableProfile({
          key: modelKey,
          pricingType: 'per-second',
          costPerUnit: 2,
        }),
      );
      const prepared = new ReplicateVideoBuilder({
        get: vi.fn(),
      } as never).buildPrompt(
        modelKey,
        {
          duration: requested,
          height: 1080,
          width: 1920,
          modelCategory: ModelCategory.VIDEO,
          prompt: 'a video',
        },
        'a video',
      );
      const quote = await service.quoteSnapshotByKey(modelKey, {
        duration: requested,
        providerInput: { ...prepared },
      });
      expect(quote.quantities.duration).toBe(seconds);
      expect(quote.credits).toBe(seconds * 2);
    },
  );
});
