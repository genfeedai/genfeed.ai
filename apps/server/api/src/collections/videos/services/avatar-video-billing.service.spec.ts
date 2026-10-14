import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import type { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  avatarEngineSnapshot,
  photoAnimationProfile,
  photoAnimationSnapshot,
} from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
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
  const probeMediaFromUrl = vi.fn();
  const service = new AvatarVideoBillingService(
    {} as CreditsUtilsService,
    { holdForService } as unknown as GenerationBillingService,
    { quoteSnapshotByKey } as unknown as ModelCreditQuoteService,
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    {} as AvatarVideoModelService,
    {} as ByokService,
    {} as HeyGenService,
    { ingredient: { findFirst } } as unknown as PrismaService,
    { probeMediaFromUrl } as unknown as FilesClientService,
    {} as PlatformSettingsService,
  );

  beforeEach(() => {
    holdForService
      .mockReset()
      .mockResolvedValue({ creditsConfig: { amount: 65 } });
    quoteSnapshotByKey.mockReset().mockResolvedValue(photoAnimationSnapshot(5));
    findFirst.mockReset();
    probeMediaFromUrl.mockReset();
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

  it('probes the voice when its ingredient has no recorded duration', async () => {
    findFirst.mockResolvedValue({ metadata: { duration: null } });
    probeMediaFromUrl.mockResolvedValue({ durationSeconds: 4.2 });

    const funded = await service.fundLipSync({
      audioIngredientId: 'audio-1',
      audioUrl: 'http://localhost/audios/audio-1',
      organizationId: 'org-1',
      useCustomerKey: false,
      userId: 'user-1',
    });

    // The narration's own media URL is probed, even on a local host.
    expect(probeMediaFromUrl).toHaveBeenCalledWith(
      'http://localhost/audios/audio-1',
      'audio',
    );
    expect(quoteSnapshotByKey).toHaveBeenCalledWith(MODEL_KEYS.HEYGEN_AVATAR, {
      duration: 5,
    });
    expect(funded.funding.credits).toBe(65);
  });

  it('refuses a voice the probe cannot measure', async () => {
    findFirst.mockResolvedValue({ metadata: {} });
    probeMediaFromUrl.mockRejectedValue(new Error('ffprobe failed'));

    await expect(
      service.fundLipSync({
        audioIngredientId: 'audio-1',
        audioUrl: 'https://cdn.example/audio-1.mp3',
        organizationId: 'org-1',
        useCustomerKey: false,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
    {} as FilesClientService,
    {} as PlatformSettingsService,
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
      {} as FilesClientService,
      {} as PlatformSettingsService,
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

describe('AvatarVideoBillingService.resolveFunding', () => {
  const quoteSnapshotByKey = vi.fn();
  const findFirst = vi.fn();
  const probeMediaFromUrl = vi.fn();
  const lookupApiKey = vi.fn();
  const resolveOrganizationConnection = vi.fn();
  const getFeatureSettings = vi.fn();
  const service = new AvatarVideoBillingService(
    {} as CreditsUtilsService,
    {} as GenerationBillingService,
    { quoteSnapshotByKey } as unknown as ModelCreditQuoteService,
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    {
      resolve: vi
        .fn()
        .mockResolvedValue({ modelKey: MODEL_KEYS.HEYGEN_AVATAR }),
    } as unknown as AvatarVideoModelService,
    { lookupApiKey } as unknown as ByokService,
    { resolveOrganizationConnection } as unknown as HeyGenService,
    { ingredient: { findFirst } } as unknown as PrismaService,
    { probeMediaFromUrl } as unknown as FilesClientService,
    { getFeatureSettings } as unknown as PlatformSettingsService,
  );
  const connection = (kind: 'byok' | 'platform') => ({
    apiKey: `${kind}-heygen-key`,
    binding: {
      credentialVersionId: 'version-1',
      kind,
      organizationId: 'org-1',
      provider: 'heygen',
    },
  });
  const speechSnapshot = (credits: number) => ({
    costSource: 'reviewed-provider',
    credits,
  });

  beforeEach(() => {
    quoteSnapshotByKey
      .mockReset()
      .mockImplementation(async (_key: string, input: { duration: number }) =>
        photoAnimationSnapshot(input.duration),
      );
    findFirst.mockReset().mockResolvedValue(null);
    probeMediaFromUrl.mockReset();
    lookupApiKey.mockReset().mockResolvedValue(undefined);
    resolveOrganizationConnection
      .mockReset()
      .mockResolvedValue(connection('platform'));
    getFeatureSettings.mockReset().mockResolvedValue({ elevenlabsModel: null });
  });

  describe('audio-driven holds', () => {
    it('holds a short script over long narration at the narration length', async () => {
      findFirst.mockResolvedValue({ metadata: { duration: 299.4 } });

      const funding = await service.resolveFunding(
        { audioIngredientId: 'narration-1', text: 'hi' },
        {
          audioIngredientId: 'narration-1',
          audioUrl: 'https://cdn.example/narration-1.mp3',
        },
        'org-1',
      );

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.HEYGEN_AVATAR,
        { duration: 300 },
      );
      expect(funding.durationQuote?.estimatedSeconds).toBe(300);
      // 300 s at 13 credits a second, not the 1 s that "hi" estimates.
      expect(funding.credits).toBe(3847);
      expect(probeMediaFromUrl).not.toHaveBeenCalled();
    });

    it('probes a raw audio URL instead of estimating from the script', async () => {
      probeMediaFromUrl.mockResolvedValue({ durationSeconds: 61.2 });

      const funding = await service.resolveFunding(
        {
          audioUrl: 'https://cdn.example/voice.mp3',
          photoUrl: 'https://cdn.example/photo.png',
          text: 'hi',
        },
        { audioUrl: 'https://cdn.example/voice.mp3' },
        'org-1',
      );

      expect(probeMediaFromUrl).toHaveBeenCalledWith(
        'https://cdn.example/voice.mp3',
        'audio',
      );
      expect(funding.durationQuote?.estimatedSeconds).toBe(62);
    });

    it('prices photo plus audio with no script at the measured length', async () => {
      probeMediaFromUrl.mockResolvedValue({ durationSeconds: 5 });

      const funding = await service.resolveFunding(
        {
          audioUrl: 'https://cdn.example/voice.mp3',
          photoUrl: 'https://cdn.example/photo.png',
          text: '',
        },
        { audioUrl: 'https://cdn.example/voice.mp3' },
        'org-1',
      );

      expect(funding).toMatchObject({ billingMode: 'platform', credits: 65 });
    });

    it('refuses platform billing when the audio cannot be measured, never estimating from text', async () => {
      probeMediaFromUrl.mockRejectedValue(new Error('ffprobe failed'));

      await expect(
        service.resolveFunding(
          {
            audioUrl: 'https://cdn.example/voice.mp3',
            text: 'A long script that would otherwise be estimated',
          },
          { audioUrl: 'https://cdn.example/voice.mp3' },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
    });

    it('never probes a raw URL that points at a private address', async () => {
      await expect(
        service.resolveFunding(
          { audioUrl: 'http://169.254.169.254/latest', text: 'hi' },
          { audioUrl: 'http://169.254.169.254/latest' },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(probeMediaFromUrl).not.toHaveBeenCalled();
    });

    it('does not measure audio for a render on the customer HeyGen key', async () => {
      resolveOrganizationConnection.mockResolvedValue(connection('byok'));

      const funding = await service.resolveFunding(
        { audioUrl: 'https://cdn.example/voice.mp3', text: '' },
        { audioUrl: 'https://cdn.example/voice.mp3' },
        'org-1',
      );

      expect(funding).toMatchObject({ billingMode: 'byok', credits: 0 });
      expect(probeMediaFromUrl).not.toHaveBeenCalled();
    });
  });

  describe('HeyGen BYOK with platform speech', () => {
    beforeEach(() => {
      resolveOrganizationConnection.mockResolvedValue(connection('byok'));
      quoteSnapshotByKey.mockResolvedValue(speechSnapshot(7));
    });

    it('charges only the ElevenLabs speech, priced on its own row', async () => {
      const funding = await service.resolveFunding(
        { elevenlabsVoiceId: 'voice-1', text: 'Founder update' },
        { elevenlabsVoiceId: 'voice-1' },
        'org-1',
      );

      expect(quoteSnapshotByKey).toHaveBeenCalledTimes(1);
      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2,
        { characters: 14, organizationId: 'org-1', provider: 'elevenlabs' },
      );
      expect(funding).toMatchObject({
        billingMode: 'platform',
        credits: 7,
        heygenApiKey: 'byok-heygen-key',
        speechModelId: 'eleven_multilingual_v2',
        speechModelKey: MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2,
      });
      expect(funding.durationQuote).toBeUndefined();
    });

    it('prices the speech model the platform settings select', async () => {
      getFeatureSettings.mockResolvedValue({
        elevenlabsModel: 'eleven_flash_v2_5',
      });

      const funding = await service.resolveFunding(
        { elevenlabsVoiceId: 'voice-1', text: 'Founder update' },
        { elevenlabsVoiceId: 'voice-1' },
        'org-1',
      );

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
        expect.objectContaining({ characters: 14 }),
      );
      expect(funding.speechModelId).toBe('eleven_flash_v2_5');
    });

    it('refuses speech with no script before any hold', async () => {
      await expect(
        service.resolveFunding(
          { elevenlabsVoiceId: 'voice-1', text: '  ' },
          { elevenlabsVoiceId: 'voice-1' },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
    });

    it('refuses a speech row without a reviewed per-character rate', async () => {
      quoteSnapshotByKey.mockResolvedValue({
        costSource: 'configured-provider',
        credits: 1,
      });

      await expect(
        service.resolveFunding(
          { elevenlabsVoiceId: 'voice-1', text: 'Founder update' },
          { elevenlabsVoiceId: 'voice-1' },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('charges nothing when the organization also brings its ElevenLabs key', async () => {
      lookupApiKey.mockResolvedValue({ apiKey: 'org-elevenlabs-key' });

      const funding = await service.resolveFunding(
        { elevenlabsVoiceId: 'voice-1', text: 'Founder update' },
        { elevenlabsVoiceId: 'voice-1' },
        'org-1',
      );

      expect(funding).toMatchObject({ billingMode: 'byok', credits: 0 });
      expect(quoteSnapshotByKey).not.toHaveBeenCalled();
    });

    it('keeps platform-key renders on the per-second avatar rate', async () => {
      resolveOrganizationConnection.mockResolvedValue(connection('platform'));
      quoteSnapshotByKey.mockImplementation(
        async (_key: string, input: { duration: number }) =>
          photoAnimationSnapshot(input.duration),
      );

      const funding = await service.resolveFunding(
        { elevenlabsVoiceId: 'voice-1', text: 'x'.repeat(60) },
        { elevenlabsVoiceId: 'voice-1' },
        'org-1',
      );

      expect(quoteSnapshotByKey).toHaveBeenCalledWith(
        MODEL_KEYS.HEYGEN_AVATAR,
        { duration: 5 },
      );
      expect(funding).toMatchObject({ billingMode: 'platform', credits: 65 });
      expect(funding.speechModelKey).toBeUndefined();
    });
  });
});
