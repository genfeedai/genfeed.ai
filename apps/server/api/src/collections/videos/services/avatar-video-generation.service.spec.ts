import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VoiceProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AvatarVideoGenerationService', () => {
  const createService = () => {
    const brandsService = {
      findOne: vi.fn(),
    };
    const configService = {
      ingredientsEndpoint: 'http://localhost:3010',
    };
    const byokService = {
      resolveApiKey: vi.fn().mockResolvedValue(null),
    };
    const creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
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
    const fleetService = {
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
      publishFileProcessing: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AvatarVideoGenerationService(
      brandsService as never,
      configService as never,
      byokService as never,
      creditsUtilsService as never,
      elevenlabsService as never,
      failedGenerationService as never,
      fleetService as never,
      heygenService as never,
      ingredientsService as never,
      loggerService,
      metadataService as never,
      orgSettingsService as never,
      sharedService as never,
      videosService as never,
      voicesService as never,
      websocketService as never,
    );

    return {
      brandsService,
      elevenlabsService,
      fleetService,
      heygenService,
      ingredientsService,
      metadataService,
      orgSettingsService,
      service,
      sharedService,
      voicesService,
    };
  };

  const context = {
    brandId: 'test-object-id',
    organizationId: 'test-object-id',
    userId: 'test-object-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links the placeholder before Fleet voice synthesis and HeyGen dispatch', async () => {
    const {
      brandsService,
      fleetService,
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
    fleetService.generateVoice.mockImplementation(async () => {
      order.push('fleet');
      return { jobId: 'voice-job-1' };
    });
    fleetService.pollJob.mockImplementation(async () => {
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

    const resolved = await (
      service as unknown as {
        resolveIdentityInputs: (
          params: Record<string, unknown>,
          contextValue: typeof context,
          brand: BrandDocument | null,
        ) => Promise<Record<string, string | undefined>>;
      }
    ).resolveIdentityInputs(
      {
        text: 'Write the launch announcement',
        useIdentity: true,
      },
      context,
      {
        agentConfig: {
          defaultAvatarPhotoUrl: 'https://cdn.example.com/brand-avatar.png',
          defaultVoiceRef: {
            externalVoiceId: 'brand-elevenlabs-voice',
            provider: VoiceProvider.ELEVENLABS,
            source: 'catalog',
          },
        },
      } as BrandDocument,
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

    const resolved = await (
      service as unknown as {
        resolveIdentityInputs: (
          params: Record<string, unknown>,
          contextValue: typeof context,
          brand: BrandDocument | null,
        ) => Promise<Record<string, string | undefined>>;
      }
    ).resolveIdentityInputs(
      {
        text: 'Create the founder update',
        useIdentity: true,
      },
      context,
      {
        agentConfig: {},
      } as BrandDocument,
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

    const resolved = await (
      service as unknown as {
        resolveIdentityInputs: (
          params: Record<string, unknown>,
          contextValue: typeof context,
          brand: BrandDocument | null,
        ) => Promise<Record<string, string | undefined>>;
      }
    ).resolveIdentityInputs(
      {
        photoIngredientId: 'brand-avatar-1',
        text: 'Create the founder update',
      },
      context,
      { agentConfig: {} } as BrandDocument,
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

    const resolved = await (
      service as unknown as {
        resolveIdentityInputs: (
          params: Record<string, unknown>,
          contextValue: typeof context,
          brand: BrandDocument | null,
        ) => Promise<Record<string, string | undefined>>;
      }
    ).resolveIdentityInputs(
      {
        clonedVoiceId: 'voice-catalog-1',
        text: 'Create the founder update',
      },
      context,
      { agentConfig: {} } as BrandDocument,
    );

    expect(voicesService.findOne).toHaveBeenCalledWith({
      id: 'voice-catalog-1',
      isDeleted: false,
      organizationId: context.organizationId,
    });
    expect(resolved.elevenlabsVoiceId).toBe('catalog-elevenlabs-voice');
  });
});
