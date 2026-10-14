import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import type { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  avatarEngineSnapshot,
  photoAnimationProfile,
  photoAnimationSnapshot,
} from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AvatarVideoBillingService.fundLipSync', () => {
  const holdForService = vi.fn();
  const quoteSnapshotByKey = vi.fn();
  const findFirst = vi.fn();
  const service = new AvatarVideoBillingService(
    {} as CreditsUtilsService,
    { holdForService } as unknown as GenerationBillingService,
    { quoteSnapshotByKey } as unknown as ModelCreditQuoteService,
    { error: vi.fn() } as unknown as LoggerService,
    {} as AvatarVideoModelService,
    {} as ByokService,
    {} as HeyGenService,
    { ingredient: { findFirst } } as unknown as PrismaService,
  );

  beforeEach(() => {
    holdForService
      .mockReset()
      .mockResolvedValue({ creditsConfig: { amount: 65 } });
    quoteSnapshotByKey.mockReset().mockResolvedValue(photoAnimationSnapshot(5));
    findFirst.mockReset();
  });

  it('skips the platform hold when the organization uses its own HeyGen key', async () => {
    const funded = await service.fundLipSync({
      audioIngredientId: 'audio-1',
      organizationId: 'org-1',
      useCustomerKey: true,
      userId: 'user-1',
    });

    expect(funded.request).toBeUndefined();
    expect(funded.funding.billingMode).toBe('byok');
    expect(findFirst).not.toHaveBeenCalled();
    expect(quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('refuses a voice ingredient with no measured duration', async () => {
    findFirst.mockResolvedValue({ metadata: { duration: null } });

    await expect(
      service.fundLipSync({
        audioIngredientId: 'audio-1',
        organizationId: 'org-1',
        useCustomerKey: false,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quoteSnapshotByKey).not.toHaveBeenCalled();
    expect(holdForService).not.toHaveBeenCalled();
  });

  it('holds the ceiled measured duration on the photo-avatar rate', async () => {
    findFirst.mockResolvedValue({ metadata: { duration: 4.2 } });

    const funded = await service.fundLipSync({
      audioIngredientId: 'audio-1',
      brandId: 'brand-1',
      organizationId: 'org-1',
      useCustomerKey: false,
      userId: 'user-1',
    });

    expect(findFirst).toHaveBeenCalledWith({
      select: { metadata: { select: { duration: true } } },
      where: { id: 'audio-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(quoteSnapshotByKey).toHaveBeenCalledWith(MODEL_KEYS.HEYGEN_AVATAR, {
      duration: 5,
    });
    expect(holdForService).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        credits: 65,
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(funded.funding).toMatchObject({
      billingMode: 'platform',
      credits: 65,
      modelKey: MODEL_KEYS.HEYGEN_AVATAR,
    });
    expect(funded.request).toEqual({ creditsConfig: { amount: 65 } });
  });
});

describe('AvatarVideoBillingService.quoteRender', () => {
  const modelCreditQuote = { quoteSnapshotByKey: vi.fn() };
  const service = new AvatarVideoBillingService(
    {} as CreditsUtilsService,
    {} as GenerationBillingService,
    modelCreditQuote as unknown as ModelCreditQuoteService,
    { error: vi.fn() } as unknown as LoggerService,
    {} as AvatarVideoModelService,
    {} as ByokService,
    {} as HeyGenService,
    {} as PrismaService,
  );

  beforeEach(() => {
    modelCreditQuote.quoteSnapshotByKey
      .mockReset()
      .mockResolvedValue(
        avatarEngineSnapshot('heygen/avatar-iv', 'digital_twin', 10),
      );
  });

  it('holds photo animation per second on heygen/avatar at the estimated seconds', async () => {
    modelCreditQuote.quoteSnapshotByKey.mockResolvedValue(
      photoAnimationSnapshot(12),
    );

    const quote = await service.quoteRender(
      { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
      12,
    );

    expect(modelCreditQuote.quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_AVATAR,
      { duration: 12 },
    );
    // $0.0385/s: 12 s is $0.462, x3.33 margin is 154 credits.
    expect(quote.credits).toBe(154);
    expect(quote.durationQuote).toMatchObject({
      estimatedSeconds: 12,
      snapshot: { costSource: 'configured-provider', credits: 154 },
    });
  });

  it('refuses photo animation with no duration basis before quoting', async () => {
    await expect(
      service.quoteRender({ modelKey: MODEL_KEYS.HEYGEN_AVATAR }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(modelCreditQuote.quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('refuses a photo-animation row that is not metered per second', async () => {
    const snapshot = photoAnimationSnapshot(12);
    modelCreditQuote.quoteSnapshotByKey.mockResolvedValue({
      ...snapshot,
      credits: 13,
      pricingProfile: { ...snapshot.pricingProfile, pricingType: 'flat' },
    });

    await expect(
      service.quoteRender({ modelKey: MODEL_KEYS.HEYGEN_AVATAR }, 12),
    ).rejects.toBeInstanceOf(BusinessLogicException);
  });

  it('prices a remix script at its estimated length on heygen/avatar', async () => {
    modelCreditQuote.quoteSnapshotByKey.mockResolvedValue(
      photoAnimationSnapshot(5),
    );

    // 60 characters at 12 characters a second is 5 s: 65 credits.
    await expect(service.quotePlatformCredits('x'.repeat(60))).resolves.toBe(
      65,
    );
    expect(modelCreditQuote.quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_AVATAR,
      { duration: 5 },
    );
  });

  it('refuses to price an empty remix script', async () => {
    await expect(service.quotePlatformCredits('  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(modelCreditQuote.quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('holds an engine render at the estimated seconds for its avatar type', async () => {
    const quote = await service.quoteRender(
      {
        avatarType: 'digital_twin',
        engine: 'avatar_iv',
        modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
      },
      10,
    );

    expect(modelCreditQuote.quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_AVATAR_IV,
      { duration: 10, selectors: { avatar_type: 'digital_twin' } },
    );
    expect(quote.credits).toBe(269);
    expect(quote.durationQuote).toMatchObject({
      estimatedSeconds: 10,
      snapshot: { costSource: 'reviewed-provider', credits: 269 },
    });
  });

  it('refuses an engine row that would price from a flat reading', async () => {
    modelCreditQuote.quoteSnapshotByKey.mockResolvedValue({
      ...avatarEngineSnapshot('heygen/avatar-iv', 'photo_avatar', 10),
      costSource: 'configured-provider',
    });

    await expect(
      service.quoteRender(
        {
          avatarType: 'photo_avatar',
          engine: 'avatar_iv',
          modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
        },
        10,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses a render with no duration basis before quoting', async () => {
    await expect(
      service.quoteRender(
        {
          avatarType: 'photo_avatar',
          engine: 'avatar_iv',
          modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(modelCreditQuote.quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('refuses a look whose avatar type could not be verified', async () => {
    await expect(
      service.quoteRender(
        { engine: 'avatar_iv', modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV },
        10,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AvatarVideoBillingService photo animation against the catalog row', () => {
  function serviceFor(profile: ReturnType<typeof photoAnimationProfile>) {
    return new AvatarVideoBillingService(
      {} as CreditsUtilsService,
      {} as GenerationBillingService,
      new ModelCreditQuoteService({
        findBillablePricingProfile: vi.fn().mockResolvedValue(profile),
      } as unknown as ModelsService),
      { error: vi.fn() } as unknown as LoggerService,
      {} as AvatarVideoModelService,
      {} as ByokService,
      {} as HeyGenService,
      {} as PrismaService,
    );
  }

  it('answers 503 for the inactive, unpriced row the uncurated catalog seeded', async () => {
    const seededBeforeCuration = {
      ...photoAnimationProfile(),
      cost: 0,
      isActive: false,
      pricingType: 'flat',
      providerCostUsd: null,
    };

    await expect(
      serviceFor(seededBeforeCuration).quoteRender(
        { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
        12,
      ),
    ).rejects.toThrow(
      'Pricing is unavailable for heygen/avatar: Exact model/provider is unavailable or does not match dispatch',
    );
  });

  it('quotes the curated row per second at the 3.33x generation margin', async () => {
    const quote = await serviceFor(photoAnimationProfile()).quoteRender(
      { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
      12,
    );

    expect(quote.credits).toBe(154);
    expect(quote.durationQuote?.snapshot).toMatchObject({
      costSource: 'configured-provider',
      providerCostUsd: 0.462,
    });
  });
});
