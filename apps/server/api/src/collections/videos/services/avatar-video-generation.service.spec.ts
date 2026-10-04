import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { AvatarVideoLifecycleService } from '@api/collections/videos/services/avatar-video-lifecycle.service';
import { AvatarVideoReferenceService } from '@api/collections/videos/services/avatar-video-reference.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { ByokProvider, VoiceProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ResolvedIdentityInputs {
  audioUrl?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  photoIngredientId?: string;
  photoUrl?: string;
  savedVoice?: {
    externalVoiceId?: string | null;
    provider?: string | null;
    sampleAudioUrl?: string | null;
  };
}

interface ResolveIdentityInputsHarness {
  resolveIdentityInputs: (
    params: Record<string, unknown>,
    contextValue: {
      brandId: string;
      organizationId: string;
      userId: string;
    },
    brand: BrandDocument | null,
  ) => Promise<ResolvedIdentityInputs>;
}

const AVATAR_PRICE = 3;

describe('AvatarVideoGenerationService', () => {
  const createService = () => {
    const brandsService = {
      findOne: vi.fn(),
    };
    const configService = {
      isAuthorizedMediaDeliveryEnabled: false,
      ingredientsEndpoint: 'http://localhost:3010',
    };
    const byokService = {
      resolveApiKey: vi.fn().mockResolvedValue(null),
    };
    const creditsUtilsService = {
      bindReservationOutput: vi
        .fn()
        .mockResolvedValue({ id: 'avatar-output-hold', amount: AVATAR_PRICE }),
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      findReservationForWorkload: vi.fn().mockResolvedValue(null),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'service-pool-1' }),
    };
    const creditDeductionQueueService = {
      queueDeduction: vi.fn().mockResolvedValue(undefined),
    };
    const modelCreditQuote = {
      quoteByKey: vi.fn().mockResolvedValue(AVATAR_PRICE),
    };
    const elevenlabsService = {
      generateAndUploadAudio: vi.fn().mockResolvedValue({
        audioUrl: 'https://cdn.example.com/speech.mp3',
        duration: 4,
      }),
    };
    const failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const managedInferenceRuntimeService = {
      generateVoice: vi.fn().mockResolvedValue({ jobId: 'voice-job-1' }),
      pollJob: vi
        .fn()
        .mockResolvedValue({ audioUrl: 'https://cdn.example.com/fleet.mp3' }),
    };
    const heygenService = {
      generatePhotoAvatarVideo: vi.fn().mockResolvedValue('heygen-job-1'),
      getAvatars: vi.fn().mockResolvedValue([]),
    };
    const ingredientsService = {
      findAvatarImageById: vi.fn().mockResolvedValue({
        cdnUrl: 'https://cdn.example.com/avatar.png',
        id: 'avatar-1',
      }),
    };
    const loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const metadataService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };
    const orgSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const sharedService = {
      createMediaDocumentsInternal: vi.fn().mockResolvedValue({
        ingredientData: { id: 'avatar-ingredient-1' },
        metadataData: { id: 'avatar-metadata-1' },
      }),
    };
    const videosService = { patch: vi.fn() };
    const voicesService = {
      findOne: vi.fn(),
    };
    const websocketService = {
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue(undefined),
      publishFileProcessing: vi.fn().mockResolvedValue(undefined),
      publishVideoProgress: vi.fn().mockResolvedValue(undefined),
    };
    const activitiesService = {
      record: vi.fn().mockResolvedValue({ id: 'avatar-activity' }),
    };
    const lifecycleService = new AvatarVideoLifecycleService(
      activitiesService as never,
      websocketService as never,
    );

    const billingTransaction = {
      crunGenerationTask: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn(),
      creditReservation: { findFirst: vi.fn().mockResolvedValue(null) },
      ingredient: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const billingPrisma = {
      crunGenerationTask: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: async (
        operation: (tx: typeof billingTransaction) => Promise<void>,
      ) => operation(billingTransaction),
    };
    const generationBilling = new GenerationBillingService(
      creditsUtilsService as never,
      creditDeductionQueueService as never,
      billingPrisma as never,
      loggerService,
      {
        reconcileOutput: vi.fn().mockResolvedValue(false),
        reconcile: vi.fn().mockResolvedValue(0),
        closeDispatch: vi.fn(),
        bindOutput: vi.fn(),
      } as never,
    );
    const mediaIssuer = { issueServerPublish: vi.fn() };
    const personas = personasServiceStub();
    const service = new AvatarVideoGenerationService(
      brandsService as never,
      byokService as never,
      new AvatarVideoBillingService(
        creditsUtilsService as never,
        generationBilling,
        modelCreditQuote as never,
        loggerService,
      ),
      elevenlabsService as never,
      failedGenerationService as never,
      managedInferenceRuntimeService as never,
      heygenService as never,
      loggerService,
      metadataService as never,
      orgSettingsService as never,
      sharedService as never,
      videosService as never,
      voicesService as never,
      lifecycleService,
      new AvatarVideoReferenceService(
        configService as never,
        ingredientsService as never,
        mediaIssuer as never,
        byokService as never,
        heygenService as never,
        personas,
      ),
    );

    return {
      personas,
      configService,
      mediaIssuer,
      brandsService,
      byokService,
      creditDeductionQueueService,
      creditsUtilsService,
      modelCreditQuote,
      elevenlabsService,
      failedGenerationService,
      managedInferenceRuntimeService,
      heygenService,
      ingredientsService,
      metadataService,
      orgSettingsService,
      service,
      sharedService,
      voicesService,
      websocketService,
    };
  };

  const context = {
    brandId: 'test-object-id',
    organizationId: 'test-object-id',
    userId: 'test-object-id',
  };

  it('reissues the canonical avatar source instead of using its cached URL when activated', async () => {
    const h = createService();
    h.configService.isAuthorizedMediaDeliveryEnabled = true;
    h.brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    h.mediaIssuer.issueServerPublish.mockResolvedValue(
      new Map([
        ['avatar-1', 'https://cdn.example.com/opaque-avatar?Signature=fresh'],
      ]),
    );
    await h.service.generateAvatarVideo(
      {
        photoIngredientId: 'avatar-1',
        audioUrl: 'https://cdn.example.com/audio.mp3',
        text: 'Speech',
      },
      context,
    );
    expect(h.mediaIssuer.issueServerPublish).toHaveBeenCalledWith(
      context.organizationId,
      ['avatar-1'],
    );
    expect(h.heygenService.generatePhotoAvatarVideo.mock.calls[0]?.[1]).toBe(
      'https://cdn.example.com/opaque-avatar?Signature=fresh',
    );
  });

  async function resolveIdentityInputs(
    service: AvatarVideoGenerationService,
    params: Record<string, unknown>,
    brand: BrandDocument | null,
  ): Promise<ResolvedIdentityInputs> {
    return (
      service as unknown as ResolveIdentityInputsHarness
    ).resolveIdentityInputs(params, context, brand);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['HeyGen voice', { heygenVoiceId: 'voice-1' }, false, 0],
    [
      'platform ElevenLabs speech',
      { elevenlabsVoiceId: 'voice-1' },
      false,
      AVATAR_PRICE,
    ],
    ['BYOK ElevenLabs speech', { elevenlabsVoiceId: 'voice-1' }, true, 0],
    [
      'Genfeed saved voice',
      { clonedVoiceId: 'saved-voice-1' },
      false,
      AVATAR_PRICE,
    ],
  ])(
    'quotes actual funding for %s with HeyGen BYOK',
    async (_label, voice, elevenLabsByok, cost) => {
      const {
        service,
        brandsService,
        byokService,
        voicesService,
        managedInferenceRuntimeService,
        elevenlabsService,
        heygenService,
      } = createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      voicesService.findOne.mockResolvedValue({
        provider: VoiceProvider.GENFEED_AI,
        sampleAudioUrl: 'https://cdn.example.com/reference.wav',
      });
      byokService.resolveApiKey.mockImplementation(
        async (_org: string, provider: ByokProvider) =>
          provider === ByokProvider.HEYGEN || elevenLabsByok
            ? { apiKey: 'org-key' }
            : null,
      );
      await expect(
        service.quoteCredits({ text: 'Speech', ...voice }, context),
      ).resolves.toEqual({
        billingMode: cost === 0 ? 'byok' : 'platform',
        credits: cost,
      });
      expect(
        managedInferenceRuntimeService.generateVoice,
      ).not.toHaveBeenCalled();
      expect(elevenlabsService.generateAndUploadAudio).not.toHaveBeenCalled();
      expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['provider-owned speech', { heygenVoiceId: 'voice-1' }, false],
    ['platform-funded speech', { elevenlabsVoiceId: 'voice-1' }, true],
    ['saved Genfeed voice', { clonedVoiceId: 'voice-1' }, true],
  ])(
    'settles direct HeyGen BYOK avatars correctly with %s',
    async (_label, voice, billable) => {
      const {
        service,
        brandsService,
        byokService,
        voicesService,
        creditsUtilsService,
      } = createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      voicesService.findOne.mockResolvedValue({
        provider: VoiceProvider.GENFEED_AI,
        sampleAudioUrl: 'https://cdn.example.com/reference.wav',
      });
      byokService.resolveApiKey.mockImplementation(
        async (_org: string, provider: ByokProvider) =>
          provider === ByokProvider.HEYGEN ? { apiKey: 'heygen-key' } : null,
      );
      await service.generateAvatarVideo(
        {
          text: 'Speech',
          photoUrl: 'https://cdn.example.com/avatar.png',
          ...voice,
        },
        context,
      );
      expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledTimes(
        billable ? 1 : 0,
      );
    },
  );

  describe('character admission (#6040)', () => {
    it('refuses a photo that is a character the brand lost before funding or any output', async () => {
      const {
        brandsService,
        creditsUtilsService,
        personas,
        service,
        sharedService,
      } = createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      vi.mocked(personas.resolveCharacterReferences).mockRejectedValueOnce(
        new NotFoundException('Reference image'),
      );

      await expect(
        service.generateAvatarVideo(
          {
            heygenVoiceId: 'voice-1',
            photoIngredientId: 'avatar-1',
            text: 'Speech',
          },
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(personas.resolveCharacterReferences).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          ingredientIds: ['avatar-1'],
          path: 'avatar-video',
        }),
      );
      expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
      expect(sharedService.createMediaDocumentsInternal).not.toHaveBeenCalled();
    });

    it('links the admitted character to the avatar output', async () => {
      const { brandsService, personas, service, sharedService } =
        createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      vi.mocked(personas.resolveCharacterReferences).mockResolvedValueOnce({
        availableAvatarIds: new Set(['avatar-1']),
        grantedAvatarOwners: new Map(),
        personaId: 'persona-1',
        personaIdByAssetId: new Map(),
      });

      await service.generateAvatarVideo(
        {
          heygenVoiceId: 'voice-1',
          photoIngredientId: 'avatar-1',
          text: 'Speech',
        },
        context,
      );

      expect(sharedService.createMediaDocumentsInternal).toHaveBeenCalledWith(
        expect.objectContaining({ personaId: 'persona-1' }),
      );
    });
  });

  it('holds, binds and never deducts for an unguarded platform caller', async () => {
    const { service, brandsService, creditsUtilsService, sharedService } =
      createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });

    await service.generateAvatarVideo(
      {
        heygenVoiceId: 'voice-1',
        photoUrl: 'https://cdn.example.com/avatar.png',
        text: 'Speech',
      },
      context,
    );

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledOnce();
    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: AVATAR_PRICE }),
    );
    expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: AVATAR_PRICE,
        reservationId: 'service-pool-1',
        workloadId: 'avatar-ingredient-1',
      }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(sharedService.createMediaDocumentsInternal).toHaveBeenCalledOnce();
  });

  it('binds the accepted render to the request hold instead of opening a second one', async () => {
    const { service, brandsService, creditsUtilsService } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    const request = {
      creditsConfig: {
        amount: AVATAR_PRICE,
        reservationId: 'pool-request',
        settlement: 'completion',
      },
      user: { id: 'u', organizationId: 'test-object-id', userId: 'u' },
    };

    await service.generateAvatarVideo(
      {
        heygenVoiceId: 'voice-1',
        photoUrl: 'https://cdn.example.com/avatar.png',
        text: 'Speech',
      },
      { ...context, request: request as never },
    );

    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'pool-request',
        workloadId: 'avatar-ingredient-1',
      }),
    );
    expect(request.creditsConfig).toMatchObject({ boundOutputCount: 1 });
  });

  it('leaves billing to a caller that bills the run itself', async () => {
    const { service, brandsService, creditsUtilsService } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });

    await service.generateAvatarVideo(
      {
        heygenVoiceId: 'voice-1',
        photoUrl: 'https://cdn.example.com/avatar.png',
        text: 'Speech',
      },
      { ...context, settleCreditsExternally: true },
    );

    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(creditsUtilsService.bindReservationOutput).not.toHaveBeenCalled();
  });

  it('binds the hold before HeyGen sees the render id', async () => {
    const { service, brandsService, creditsUtilsService, metadataService } =
      createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });

    await service.generateAvatarVideo(
      {
        heygenVoiceId: 'voice-1',
        photoUrl: 'https://cdn.example.com/avatar.png',
        text: 'Speech',
      },
      context,
    );

    const externalIdPatch = metadataService.patch.mock.calls.findIndex(
      ([, patch]) => patch?.externalId === 'heygen-job-1',
    );
    expect(
      creditsUtilsService.bindReservationOutput.mock.invocationCallOrder[0],
    ).toBeLessThan(
      metadataService.patch.mock.invocationCallOrder[externalIdPatch],
    );
  });

  it.each(['metadata', 'notification'])(
    'preserves an accepted avatar after a %s outage',
    async (outage) => {
      const {
        service,
        brandsService,
        metadataService,
        websocketService,
        creditsUtilsService,
        creditDeductionQueueService,
        failedGenerationService,
      } = createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      if (outage === 'metadata')
        metadataService.patch.mockImplementation(async (_id, metadata) => {
          if (metadata.externalId) throw new Error('metadata unavailable');
        });
      else
        websocketService.publishVideoProgress.mockRejectedValue(
          new Error('notification unavailable'),
        );
      await expect(
        service.generateAvatarVideo(
          {
            heygenVoiceId: 'voice-1',
            photoUrl: 'https://cdn.example/avatar.png',
            text: 'Speech',
          },
          context,
        ),
      ).resolves.toEqual({
        externalId: 'heygen-job-1',
        ingredientId: 'avatar-ingredient-1',
        status: 'processing',
      });
      expect(
        creditsUtilsService.releaseReservation,
      ).toHaveBeenCalledExactlyOnceWith({
        organizationId: 'test-object-id',
        reservationId: 'service-pool-1',
      });
      expect(
        creditsUtilsService.findReservationForWorkload,
      ).not.toHaveBeenCalled();
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).not.toHaveBeenCalled();
      if (outage === 'metadata')
        expect(creditDeductionQueueService.queueDeduction).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 0,
            acceptedGeneration: {
              ingredientId: 'avatar-ingredient-1',
              externalId: 'heygen-job-1',
            },
          }),
        );
    },
  );

  it('releases the hold and charges nothing when HeyGen rejects the job', async () => {
    const {
      service,
      brandsService,
      creditsUtilsService,
      creditDeductionQueueService,
      heygenService,
    } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    heygenService.generatePhotoAvatarVideo.mockRejectedValue(
      new HeyGenSubmissionRejectedError(),
    );

    await expect(
      service.generateAvatarVideo(
        {
          heygenVoiceId: 'voice-1',
          photoUrl: 'https://cdn.example.com/avatar.png',
          text: 'Speech',
        },
        context,
      ),
    ).rejects.toThrow();

    expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalled();
    expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'test-object-id',
      reservationId: 'service-pool-1',
    });
    expect(creditDeductionQueueService.queueDeduction).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });

  it.each([
    'response lost after acceptance',
    'submission returned no operation identity',
  ])(
    'retains the actual service output and bound funding when %s',
    async (message) => {
      const {
        service,
        brandsService,
        heygenService,
        failedGenerationService,
        creditsUtilsService,
      } = createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      heygenService.generatePhotoAvatarVideo.mockRejectedValue(
        new Error(message),
      );
      await expect(
        service.generateAvatarVideo(
          {
            heygenVoiceId: 'voice-1',
            photoUrl: 'https://cdn.example/avatar.png',
            text: 'Speech',
          },
          context,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ detail: message }),
      });
      expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            assetId: 'avatar-ingredient-1',
            submissionIntent: { version: 1, provider: ByokProvider.HEYGEN },
          },
        }),
      );
      expect(
        failedGenerationService.handleFailedVideoGeneration,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.findReservationForWorkload,
      ).not.toHaveBeenCalled();
      expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'avatar-output-hold' }),
      );
    },
  );

  it('fails closed instead of rendering free when the model row has no price', async () => {
    const {
      service,
      brandsService,
      modelCreditQuote,
      sharedService,
      heygenService,
    } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    modelCreditQuote.quoteByKey.mockResolvedValue(0);

    await expect(
      service.generateAvatarVideo(
        {
          heygenVoiceId: 'voice-1',
          photoUrl: 'https://cdn.example.com/avatar.png',
          text: 'Speech',
        },
        context,
      ),
    ).rejects.toMatchObject({ errorCode: 'PRICING_NOT_CONFIGURED' });

    expect(sharedService.createMediaDocumentsInternal).not.toHaveBeenCalled();
    expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
  });

  it('prices the platform charge from the heygen/avatar model row', async () => {
    const { service, brandsService, modelCreditQuote } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });

    const price = await service.quoteCredits(
      {
        heygenVoiceId: 'voice-1',
        photoUrl: 'https://cdn.example.com/avatar.png',
        text: 'Speech',
      },
      context,
    );

    expect(price).toEqual({ billingMode: 'platform', credits: AVATAR_PRICE });
    expect(modelCreditQuote.quoteByKey).toHaveBeenCalledWith('heygen/avatar');
  });

  it('pins both provider keys before reservation, even when org keys change during admission', async () => {
    const {
      service,
      brandsService,
      byokService,
      elevenlabsService,
      heygenService,
    } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    byokService.resolveApiKey.mockImplementation(
      async (_org: string, provider: ByokProvider) => ({
        apiKey: `pinned-${provider}`,
      }),
    );
    const reserve = vi.fn(async () => {
      byokService.resolveApiKey.mockResolvedValue(null);
    });
    await service.generateAvatarVideo(
      {
        text: 'Speech',
        elevenlabsVoiceId: 'voice-1',
        photoUrl: 'https://cdn.example.com/avatar.png',
      },
      context,
      undefined,
      {
        groupId: 'run-1',
        groupIndex: 0,
        isByokBypass: true,
        settleCreditsExternally: true,
      },
      reserve,
    );
    expect(reserve).toHaveBeenCalledWith({ billingMode: 'byok', credits: 0 });
    expect(elevenlabsService.generateAndUploadAudio.mock.calls[0][5]).toBe(
      `pinned-${ByokProvider.ELEVENLABS}`,
    );
    expect(heygenService.generatePhotoAvatarVideo.mock.calls[0][5]).toBe(
      `pinned-${ByokProvider.HEYGEN}`,
    );
    expect(byokService.resolveApiKey).toHaveBeenCalledTimes(2);
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
      elevenlabsService.generateAndUploadAudio.mock.invocationCallOrder[0],
    );
  });

  it('validates accepted funding before either platform speech or video runs', async () => {
    const { service, brandsService, elevenlabsService, heygenService } =
      createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    const reserve = vi.fn(async () => {
      throw new HttpException('Funding changed', HttpStatus.CONFLICT);
    });
    await expect(
      service.generateAvatarVideo(
        {
          text: 'Speech',
          elevenlabsVoiceId: 'voice-1',
          photoUrl: 'https://cdn.example.com/avatar.png',
        },
        context,
        undefined,
        {
          groupId: 'run-1',
          groupIndex: 0,
          isByokBypass: true,
          settleCreditsExternally: true,
        },
        reserve,
      ),
    ).rejects.toThrow('Funding changed');
    expect(reserve).toHaveBeenCalledWith({
      billingMode: 'platform',
      credits: AVATAR_PRICE,
    });
    expect(elevenlabsService.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'charges platform credits only without HeyGen BYOK (BYOK: %s)',
    async (isByok) => {
      const {
        service,
        brandsService,
        byokService,
        creditsUtilsService,
        heygenService,
      } = createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      byokService.resolveApiKey.mockResolvedValue(
        isByok ? { apiKey: 'byok-test-key' } : null,
      );
      await service.generateAvatarVideo(
        {
          photoUrl: 'https://cdn.example.com/avatar.png',
          audioUrl: 'https://cdn.example.com/audio.mp3',
          text: 'Founder update',
        },
        context,
      );
      expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
        'avatar-ingredient-1',
        expect.any(String),
        expect.any(Object),
        context.organizationId,
        context.userId,
        isByok ? 'byok-test-key' : undefined,
        '9:16',
      );
      expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledTimes(
        isByok ? 0 : 1,
      );
    },
  );

  it.each([
    [false, 1],
    [true, 0],
  ])(
    'with HeyGen BYOK, charges for ElevenLabs speech unless that is BYOK too (ElevenLabs BYOK: %s)',
    async (isElevenLabsByok, expectedDeductions) => {
      const { service, brandsService, byokService, creditsUtilsService } =
        createService();
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        id: 'brand-1',
      });
      byokService.resolveApiKey.mockImplementation(
        async (_organizationId: string, provider: ByokProvider) =>
          provider === ByokProvider.HEYGEN || isElevenLabsByok
            ? { apiKey: `${provider}-byok-test-key` }
            : null,
      );
      await service.generateAvatarVideo(
        {
          elevenlabsVoiceId: 'voice-1',
          photoUrl: 'https://cdn.example.com/avatar.png',
          text: 'Founder update',
        },
        context,
      );
      expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledTimes(
        expectedDeductions,
      );
    },
  );

  it('with HeyGen BYOK, still charges for speech from a saved Genfeed voice', async () => {
    const {
      brandsService,
      byokService,
      creditsUtilsService,
      managedInferenceRuntimeService,
      service,
      voicesService,
    } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: null,
      id: 'voice-fleet-1',
      isCloned: true,
      organizationId: context.organizationId,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: 'https://cdn.example.com/reference.wav',
    });
    byokService.resolveApiKey.mockImplementation(
      async (_organizationId: string, provider: ByokProvider) =>
        provider === ByokProvider.HEYGEN
          ? { apiKey: 'heygen-byok-test-key' }
          : null,
    );
    managedInferenceRuntimeService.generateVoice.mockResolvedValue({
      jobId: 'voice-job-1',
    });
    managedInferenceRuntimeService.pollJob.mockResolvedValue({
      audioUrl: 'https://cdn.example.com/fleet.mp3',
    });

    await service.generateAvatarVideo(
      {
        clonedVoiceId: 'voice-fleet-1',
        photoIngredientId: 'avatar-1',
        text: 'Create the founder update',
      },
      context,
    );

    expect(creditsUtilsService.bindReservationOutput).toHaveBeenCalledTimes(1);
  });

  it('publishes initial progress on the ingredient video path for its user', async () => {
    const { service, brandsService, websocketService } = createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    await service.generateAvatarVideo(
      {
        photoUrl: 'https://cdn.example.com/avatar.png',
        audioUrl: 'https://cdn.example.com/audio.mp3',
        text: 'Create the founder update',
      },
      context,
    );
    expect(websocketService.publishVideoProgress).toHaveBeenCalledWith(
      WebSocketPaths.video('avatar-ingredient-1'),
      0,
      context.userId,
      `user:${context.userId}`,
    );
    expect(websocketService.publishFileProcessing).not.toHaveBeenCalled();
  });

  it('records an avatar failure with the payload shape the failure handler parses', async () => {
    const { brandsService, failedGenerationService, heygenService, service } =
      createService();
    brandsService.findOne.mockResolvedValue({ agentConfig: {}, id: 'brand-1' });
    heygenService.generatePhotoAvatarVideo.mockRejectedValue(
      new HeyGenSubmissionRejectedError(),
    );

    await expect(
      service.generateAvatarVideo(
        {
          photoUrl: 'https://cdn.example.com/avatar.png',
          audioUrl: 'https://cdn.example.com/audio.mp3',
          text: 'Create the founder update',
        },
        context,
      ),
    ).rejects.toBeInstanceOf(HttpException);

    // A bare id here throws in the handler's JSON.parse, which orphans the
    // VIDEO_PROCESSING row and creates a duplicate activity with no entity.
    const [, , , , , activityMetadata] =
      failedGenerationService.handleFailedVideoGeneration.mock.calls[0];
    expect(JSON.parse((activityMetadata as { value: string }).value)).toEqual({
      error: 'HeyGen rejected the submission due to insufficient credit.',
      ingredientId: 'avatar-ingredient-1',
    });
  });

  it('links the placeholder before Fleet voice synthesis and HeyGen dispatch', async () => {
    const {
      brandsService,
      managedInferenceRuntimeService,
      heygenService,
      metadataService,
      service,
      sharedService,
      voicesService,
    } = createService();
    const order: string[] = [];
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: null,
      id: 'voice-fleet-1',
      isCloned: true,
      organizationId: context.organizationId,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: 'https://cdn.example.com/reference.wav',
    });
    sharedService.createMediaDocumentsInternal.mockImplementation(async () => {
      order.push('placeholder');
      return {
        ingredientData: { id: 'avatar-ingredient-1' },
        metadataData: { id: 'avatar-metadata-1' },
      };
    });
    metadataService.patch.mockImplementation(async (_id, entity) => {
      if ((entity as { externalProvider?: string }).externalProvider) {
        order.push('provider-marked');
      }
    });
    managedInferenceRuntimeService.generateVoice.mockImplementation(
      async () => {
        order.push('fleet');
        return { jobId: 'voice-job-1' };
      },
    );
    managedInferenceRuntimeService.pollJob.mockImplementation(async () => {
      order.push('fleet-poll');
      return { audioUrl: 'https://cdn.example.com/fleet.mp3' };
    });
    heygenService.generatePhotoAvatarVideo.mockImplementation(async () => {
      order.push('heygen');
      return 'heygen-job-1';
    });

    await service.generateAvatarVideo(
      {
        clonedVoiceId: 'voice-fleet-1',
        photoIngredientId: 'avatar-1',
        text: 'Create the founder update',
      },
      context,
      async (ingredientId) => {
        order.push(`linked:${ingredientId}`);
      },
    );

    expect(order).toEqual([
      'placeholder',
      'linked:avatar-ingredient-1',
      'provider-marked',
      'fleet',
      'fleet-poll',
      'heygen',
    ]);
  });

  it('links the placeholder before ElevenLabs synthesis and HeyGen dispatch', async () => {
    const {
      brandsService,
      elevenlabsService,
      heygenService,
      service,
      sharedService,
      voicesService,
    } = createService();
    const order: string[] = [];
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: 'elevenlabs-voice-1',
      id: 'voice-elevenlabs-1',
      isCloned: false,
      organizationId: context.organizationId,
      provider: VoiceProvider.ELEVENLABS,
      sampleAudioUrl: null,
    });
    sharedService.createMediaDocumentsInternal.mockImplementation(async () => {
      order.push('placeholder');
      return {
        ingredientData: { id: 'avatar-ingredient-1' },
        metadataData: { id: 'avatar-metadata-1' },
      };
    });
    elevenlabsService.generateAndUploadAudio.mockImplementation(async () => {
      order.push('elevenlabs');
      return {
        audioUrl: 'https://cdn.example.com/speech.mp3',
        duration: 4,
      };
    });
    heygenService.generatePhotoAvatarVideo.mockImplementation(async () => {
      order.push('heygen');
      return 'heygen-job-1';
    });

    await service.generateAvatarVideo(
      {
        clonedVoiceId: 'voice-elevenlabs-1',
        photoIngredientId: 'avatar-1',
        text: 'Create the founder update',
      },
      context,
      async (ingredientId) => {
        order.push(`linked:${ingredientId}`);
      },
    );

    expect(order).toEqual([
      'placeholder',
      'linked:avatar-ingredient-1',
      'elevenlabs',
      'heygen',
    ]);
  });

  it('prefers brand identity defaults before organization defaults', async () => {
    const { orgSettingsService, service } = createService();
    const resolveSavedVoiceRef = vi
      .spyOn(service as never, 'resolveSavedVoiceRef')
      .mockResolvedValue({
        elevenlabsVoiceId: 'brand-elevenlabs-voice',
      });

    orgSettingsService.findOne.mockResolvedValue({
      defaultAvatarPhotoUrl: 'https://cdn.example.com/org-avatar.png',
      defaultVoiceRef: {
        externalVoiceId: 'org-elevenlabs-voice',
        provider: VoiceProvider.ELEVENLABS,
        source: 'catalog',
      },
    });

    const resolved = await resolveIdentityInputs(
      service,
      {
        text: 'Write the launch announcement',
        useIdentity: true,
      },
      {
        agentConfig: {
          defaultAvatarPhotoUrl: 'https://cdn.example.com/brand-avatar.png',
          defaultVoiceRef: {
            externalVoiceId: 'brand-elevenlabs-voice',
            provider: VoiceProvider.ELEVENLABS,
            source: 'catalog',
          },
        },
      } as unknown as BrandDocument,
    );

    expect(resolved.photoUrl).toBe('https://cdn.example.com/brand-avatar.png');
    expect(resolved.elevenlabsVoiceId).toBe('brand-elevenlabs-voice');
    expect(resolveSavedVoiceRef).toHaveBeenCalledTimes(1);
    expect(resolveSavedVoiceRef).toHaveBeenCalledWith(
      expect.objectContaining({
        externalVoiceId: 'brand-elevenlabs-voice',
      }),
      context.organizationId,
      'Write the launch announcement',
    );
  });

  it('falls back to organization identity defaults when the brand has none', async () => {
    const { orgSettingsService, service } = createService();
    const resolveSavedVoiceRef = vi
      .spyOn(service as never, 'resolveSavedVoiceRef')
      .mockResolvedValue({
        heygenVoiceId: 'org-heygen-voice',
      });

    orgSettingsService.findOne.mockResolvedValue({
      defaultAvatarPhotoUrl: 'https://cdn.example.com/org-avatar.png',
      defaultVoiceRef: {
        externalVoiceId: 'org-heygen-voice',
        provider: VoiceProvider.HEYGEN,
        source: 'catalog',
      },
    });

    const resolved = await resolveIdentityInputs(
      service,
      {
        text: 'Create the founder update',
        useIdentity: true,
      },
      {
        agentConfig: {},
      } as unknown as BrandDocument,
    );

    expect(resolved.photoUrl).toBe('https://cdn.example.com/org-avatar.png');
    expect(resolved.heygenVoiceId).toBe('org-heygen-voice');
    expect(resolveSavedVoiceRef).toHaveBeenCalledWith(
      expect.objectContaining({
        externalVoiceId: 'org-heygen-voice',
      }),
      context.organizationId,
      'Create the founder update',
    );
  });

  it('preserves an authorized explicit photo ingredient without enabling defaults', async () => {
    const { service } = createService();

    const resolved = await resolveIdentityInputs(
      service,
      {
        photoIngredientId: 'brand-avatar-1',
        text: 'Create the founder update',
      },
      { agentConfig: {} } as unknown as BrandDocument,
    );

    expect(resolved.photoIngredientId).toBe('brand-avatar-1');
  });

  it('resolves an explicit catalog voice Ingredient even when it is not cloned', async () => {
    const { service, voicesService } = createService();
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: 'catalog-elevenlabs-voice',
      id: 'voice-catalog-1',
      isCloned: false,
      organizationId: context.organizationId,
      provider: VoiceProvider.ELEVENLABS,
      sampleAudioUrl: null,
    });

    const resolved = await resolveIdentityInputs(
      service,
      {
        clonedVoiceId: 'voice-catalog-1',
        text: 'Create the founder update',
      },
      { agentConfig: {} } as unknown as BrandDocument,
    );

    expect(voicesService.findOne).toHaveBeenCalledWith({
      id: 'voice-catalog-1',
      isDeleted: false,
      organizationId: context.organizationId,
    });
    expect(resolved.elevenlabsVoiceId).toBe('catalog-elevenlabs-voice');
  });

  it('admits an authorized provider-backed saved voice', async () => {
    const {
      brandsService,
      elevenlabsService,
      heygenService,
      service,
      voicesService,
    } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: 'elevenlabs-voice-1',
      id: 'voice-elevenlabs-1',
      isCloned: false,
      organizationId: context.organizationId,
      provider: VoiceProvider.ELEVENLABS,
      sampleAudioUrl: null,
    });

    const result = await service.generateAvatarVideo(
      {
        clonedVoiceId: 'voice-elevenlabs-1',
        photoIngredientId: 'avatar-1',
        text: 'Create the founder update',
      },
      context,
    );

    expect(result).toEqual({
      externalId: 'heygen-job-1',
      ingredientId: 'avatar-ingredient-1',
      status: 'processing',
    });
    expect(elevenlabsService.generateAndUploadAudio).toHaveBeenCalledWith(
      'elevenlabs-voice-1',
      'Create the founder update',
      expect.any(String),
      context.organizationId,
      context.userId,
      undefined,
    );
    expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalled();
  });

  it('admits an authorized sample-backed saved voice', async () => {
    const {
      brandsService,
      managedInferenceRuntimeService,
      heygenService,
      service,
      voicesService,
    } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: null,
      id: 'voice-fleet-1',
      isCloned: true,
      organizationId: context.organizationId,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: 'https://cdn.example.com/reference.wav',
    });

    const result = await service.generateAvatarVideo(
      {
        clonedVoiceId: 'voice-fleet-1',
        photoIngredientId: 'avatar-1',
        text: 'Create the founder update',
      },
      context,
    );

    expect(result.status).toBe('processing');
    expect(managedInferenceRuntimeService.generateVoice).toHaveBeenCalledWith({
      organizationId: context.organizationId,
      referenceAudio: 'https://cdn.example.com/reference.wav',
      text: 'Create the founder update',
    });
    expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalled();
  });

  it('rejects an explicit clone-only saved voice before placeholder, credit, or provider work', async () => {
    const {
      brandsService,
      creditsUtilsService,
      elevenlabsService,
      failedGenerationService,
      managedInferenceRuntimeService,
      heygenService,
      service,
      sharedService,
      voicesService,
    } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: null,
      id: 'voice-clone-only',
      isCloned: true,
      organizationId: context.organizationId,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: null,
    });

    try {
      await service.generateAvatarVideo(
        {
          clonedVoiceId: 'voice-clone-only',
          photoIngredientId: 'avatar-1',
          text: 'Create the founder update',
        },
        context,
        async () => undefined,
        {
          groupId: 'run-1',
          groupIndex: 0,
          settleCreditsExternally: true,
        },
        async () => undefined,
      );
      expect.unreachable('clone-only explicit voices must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).getResponse()).toMatchObject({
        detail: 'The selected voice must be a usable saved brand voice.',
        title: 'Validation failed',
      });
      expect(
        JSON.stringify((error as HttpException).getResponse()),
      ).not.toContain('voice-clone-only');
    }

    expect(sharedService.createMediaDocumentsInternal).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).not.toHaveBeenCalled();
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(elevenlabsService.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(managedInferenceRuntimeService.generateVoice).not.toHaveBeenCalled();
    expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
    expect(
      failedGenerationService.handleFailedVideoGeneration,
    ).not.toHaveBeenCalled();
  });

  it('fails closed for a foreign explicit saved voice without disclosing existence', async () => {
    const {
      brandsService,
      creditsUtilsService,
      heygenService,
      service,
      sharedService,
      voicesService,
    } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue(null);

    try {
      await service.generateAvatarVideo(
        {
          clonedVoiceId: 'voice-foreign-1',
          photoIngredientId: 'avatar-1',
          text: 'Create the founder update',
        },
        context,
      );
      expect.unreachable('foreign explicit voices must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({
        detail: 'The selected voice must be a usable saved brand voice.',
        title: 'Validation failed',
      });
      expect(
        JSON.stringify((error as HttpException).getResponse()),
      ).not.toContain('voice-foreign-1');
    }

    expect(voicesService.findOne).toHaveBeenCalledWith({
      id: 'voice-foreign-1',
      isDeleted: false,
      organizationId: context.organizationId,
    });
    expect(sharedService.createMediaDocumentsInternal).not.toHaveBeenCalled();
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
  });

  it('bypasses an unusable default saved voice and selects the next authorized candidate', async () => {
    const { orgSettingsService, service, voicesService } = createService();
    voicesService.findOne.mockImplementation(({ id }: { id: string }) => {
      if (id === 'voice-clone-only') {
        return Promise.resolve({
          externalVoiceId: null,
          id: 'voice-clone-only',
          isCloned: true,
          organizationId: context.organizationId,
          provider: VoiceProvider.GENFEED_AI,
          sampleAudioUrl: null,
        });
      }
      return Promise.resolve(null);
    });
    orgSettingsService.findOne.mockResolvedValue({
      defaultAvatarPhotoUrl: 'https://cdn.example.com/org-avatar.png',
      defaultVoiceRef: {
        externalVoiceId: 'org-elevenlabs-voice',
        provider: VoiceProvider.ELEVENLABS,
        source: 'catalog',
      },
    });

    const resolved = await resolveIdentityInputs(
      service,
      {
        text: 'Create the founder update',
        useIdentity: true,
      },
      {
        agentConfig: {
          defaultVoiceId: 'voice-clone-only',
        },
      } as unknown as BrandDocument,
    );

    expect(voicesService.findOne).toHaveBeenCalledWith({
      id: 'voice-clone-only',
      isDeleted: false,
      organizationId: context.organizationId,
    });
    expect(resolved.savedVoice).toBeUndefined();
    expect(resolved.elevenlabsVoiceId).toBe('org-elevenlabs-voice');
  });

  it('generates with a usable fallback after bypassing a clone-only default', async () => {
    const {
      brandsService,
      elevenlabsService,
      managedInferenceRuntimeService,
      heygenService,
      orgSettingsService,
      service,
      voicesService,
    } = createService();
    brandsService.findOne.mockResolvedValue({
      agentConfig: {
        defaultVoiceId: 'voice-clone-only',
      },
      id: 'brand-1',
    });
    voicesService.findOne.mockResolvedValue({
      externalVoiceId: null,
      id: 'voice-clone-only',
      isCloned: true,
      organizationId: context.organizationId,
      provider: VoiceProvider.GENFEED_AI,
      sampleAudioUrl: null,
    });
    orgSettingsService.findOne.mockResolvedValue({
      defaultVoiceRef: {
        externalVoiceId: 'org-elevenlabs-voice',
        provider: VoiceProvider.ELEVENLABS,
        source: 'catalog',
      },
    });

    const result = await service.generateAvatarVideo(
      {
        photoIngredientId: 'avatar-1',
        text: 'Create the founder update',
        useIdentity: true,
      },
      context,
    );

    expect(result.status).toBe('processing');
    expect(managedInferenceRuntimeService.generateVoice).not.toHaveBeenCalled();
    expect(elevenlabsService.generateAndUploadAudio).toHaveBeenCalledWith(
      'org-elevenlabs-voice',
      'Create the founder update',
      expect.any(String),
      context.organizationId,
      context.userId,
      undefined,
    );
    expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalled();
  });
});
