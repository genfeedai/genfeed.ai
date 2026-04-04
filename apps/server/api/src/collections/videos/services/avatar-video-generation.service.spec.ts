import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VoiceProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AvatarVideoGenerationService', () => {
  const createService = () => {
    const brandsService = {
      findOne: vi.fn(),
    };
    const configService = {
      ingredientsEndpoint: 'http://localhost:3001',
    };
    const byokService = {
      resolveApiKey: vi.fn(),
    };
    const creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn(),
    };
    const elevenlabsService = {};
    const failedGenerationService = {};
    const fleetService = {};
    const heygenService = {
      generatePhotoAvatarVideo: vi.fn(),
    };
    const ingredientsService = {
      findAvatarImageById: vi.fn(),
    };
    const loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    const metadataService = {
      patch: vi.fn(),
    };
    const orgSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const sharedService = {
      saveDocumentsInternal: vi.fn(),
    };
    const videosService = {};
    const voicesService = {
      findOne: vi.fn(),
    };
    const websocketService = {
      publishFileProcessing: vi.fn(),
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
      orgSettingsService,
      service,
      voicesService,
    };
  };

  const context = {
    brandId: new Types.ObjectId().toString(),
    organizationId: new Types.ObjectId().toString(),
    userId: new Types.ObjectId().toString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
});
