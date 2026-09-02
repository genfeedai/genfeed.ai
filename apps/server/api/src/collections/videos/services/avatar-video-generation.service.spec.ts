import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VoiceProvider } from '@genfeedai/enums';
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
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
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
      publishFileProcessing: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AvatarVideoGenerationService(
      brandsService as never,
      configService as never,
      byokService as never,
      creditsUtilsService as never,
      elevenlabsService as never,
      failedGenerationService as never,
      managedInferenceRuntimeService as never,
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
      creditsUtilsService,
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
    };
  };

  const context = {
    brandId: 'test-object-id',
    organizationId: 'test-object-id',
    userId: 'test-object-id',
  };

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
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
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
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
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
