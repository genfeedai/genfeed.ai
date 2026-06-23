import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, VoiceProvider } from '@genfeedai/enums';
import { VoiceProvider as DbVoiceProvider } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_test123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee',
      organization: '507f191e810c19729de860ee',
      user: '507f191e810c19729de860ee',
      ...overrides,
    },
  };
}

function createMockRequest() {
  return {
    get: vi.fn().mockReturnValue('localhost'),
    originalUrl: '/api/voices',
    protocol: 'https',
  };
}

describe('VoicesController', () => {
  let controller: VoicesController;
  let voicesService: Record<string, ReturnType<typeof vi.fn>>;
  let elevenLabsService: Record<string, ReturnType<typeof vi.fn>>;
  let externalVoiceCatalogService: Record<string, ReturnType<typeof vi.fn>>;
  let sharedService: Record<string, ReturnType<typeof vi.fn>>;
  let byokService: Record<string, ReturnType<typeof vi.fn>>;
  let fleetService: Record<string, ReturnType<typeof vi.fn>>;
  let heygenService: Record<string, ReturnType<typeof vi.fn>>;
  let metadataService: Record<string, ReturnType<typeof vi.fn>>;
  let notificationsService: Record<string, ReturnType<typeof vi.fn>>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    voicesService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      patchAll: vi.fn(),
      remove: vi.fn(),
      updateOne: vi.fn(),
    };
    elevenLabsService = {
      cloneVoice: vi.fn(),
      deleteVoice: vi.fn(),
      generateAndUploadAudio: vi.fn(),
    };
    externalVoiceCatalogService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      syncFromProviders: vi.fn(),
    };
    sharedService = {
      saveDocuments: vi.fn(),
    };
    byokService = {
      resolveApiKey: vi.fn(),
    };
    fleetService = {
      cloneVoice: vi.fn(),
      isAvailable: vi.fn(),
    };
    heygenService = {
      cloneVoice: vi.fn(),
      deleteVoice: vi.fn(),
      generateAndUploadAudio: vi.fn(),
      getVoices: vi.fn(),
    };
    notificationsService = {
      publishAssetStatus: vi.fn(),
    };
    metadataService = {
      patch: vi.fn(),
    };
    logger = createMockLogger();

    controller = new VoicesController(
      byokService as unknown as ByokService,
      elevenLabsService as unknown as ElevenLabsService,
      externalVoiceCatalogService as unknown as ExternalVoiceCatalogService,
      fleetService as unknown as FleetService,
      heygenService as unknown as HeyGenService,
      logger as unknown as LoggerService,
      metadataService as unknown as MetadataService,
      notificationsService as unknown as NotificationsPublisherService,
      sharedService as unknown as SharedService,
      voicesService as unknown as VoicesService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return serialized voice collection', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      voicesService.findAll.mockResolvedValue({
        docs: [{ _id: '507f191e810c19729de860ee', isCloned: true }],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findAll(
        {} as never,
        request as never,
        user as never,
      );
      expect(result).toBeDefined();
      expect(voicesService.findAll).toHaveBeenCalled();
    });

    it('builds a tenant-scoped query for cloned/generated voices only', async () => {
      const brandId = '507f191e810c19729de860ee';
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({
        brand: brandId,
        organization: organizationId,
      });
      const request = createMockRequest();

      voicesService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findAll({} as never, request as never, user as never);

      const [query] = voicesService.findAll.mock.calls[0] ?? [];
      expect(query).toMatchObject({
        where: {
          OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
          brandId,
          category: IngredientCategory.VOICE,
          isDeleted: false,
          organizationId,
        },
      });
    });

    it('ignores tenant override query params and scopes to legacy auth provider metadata', async () => {
      const brandId = '507f191e810c19729de860ee';
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({
        brand: brandId,
        organization: organizationId,
      });
      const request = createMockRequest();

      voicesService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findAll(
        {
          brand: 'attacker-brand-id',
          organization: 'attacker-org-id',
        } as never,
        request as never,
        user as never,
      );

      const [query] = voicesService.findAll.mock.calls.at(-1) ?? [];
      // brandId and organizationId come from legacy auth provider metadata, not query params
      expect(query.where.brandId).toBe(brandId);
      expect(query.where.organizationId).toBe(organizationId);
    });

    it('applies isVoiceActive and voiceProvider filters to the query', async () => {
      const brandId = '507f191e810c19729de860ee';
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({
        brand: brandId,
        organization: organizationId,
      });
      const request = createMockRequest();

      voicesService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findAll(
        {
          isActive: true,
          providers: [VoiceProvider.GENFEED_AI, VoiceProvider.HEYGEN],
          search: 'radio',
        } as never,
        request as never,
        user as never,
      );

      const [query] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(query).toMatchObject({
        where: {
          isVoiceActive: { not: false },
          voiceProvider: {
            in: [VoiceProvider.GENFEED_AI, VoiceProvider.HEYGEN],
          },
        },
      });
      // Search filter uses AND clause
      expect(query.where.AND).toBeDefined();
    });

    it('sets isVoiceActive=false when isActive=false is requested', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      voicesService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findAll(
        { isActive: false } as never,
        request as never,
        user as never,
      );

      const [query] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(query.where.isVoiceActive).toBe(false);
    });

    it('should throw 500 when findAll fails', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      voicesService.findAll.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.findAll({} as never, request as never, user as never),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findCatalog', () => {
    it('should return catalog voices from ExternalVoiceCatalogService', async () => {
      const request = createMockRequest();
      const mockVoice = {
        createdAt: new Date(),
        externalId: 'ev_123',
        externalProvider: 'ELEVENLABS',
        id: 'catalog_id_1',
        isActive: true,
        isDefaultSelectable: true,
        isFeatured: false,
        language: 'en',
        name: 'Rachel',
        providerData: {},
        sampleAudioUrl: 'https://cdn.example.com/rachel.mp3',
        updatedAt: new Date(),
      };
      externalVoiceCatalogService.findAll.mockResolvedValue([mockVoice]);

      const result = await controller.findCatalog(
        request as never,
        undefined,
        undefined,
      );
      expect(result).toBeDefined();
      expect(externalVoiceCatalogService.findAll).toHaveBeenCalled();
    });

    it('passes provider filter to ExternalVoiceCatalogService', async () => {
      const request = createMockRequest();
      externalVoiceCatalogService.findAll.mockResolvedValue([]);

      await controller.findCatalog(request as never, 'ELEVENLABS', undefined);

      // Catalog filters query the ExternalVoice table directly, so the controller
      // forwards the DB-cased (Prisma, UPPERCASE) provider — not the app enum.
      expect(externalVoiceCatalogService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ provider: DbVoiceProvider.ELEVENLABS }),
      );
    });
  });

  describe('importCatalogVoices', () => {
    it('should return 403 for non-super-admin', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      await expect(
        controller.importCatalogVoices(
          request as never,
          user as never,
          {} as never,
        ),
      ).rejects.toThrow(HttpException);

      try {
        await controller.importCatalogVoices(
          request as never,
          user as never,
          {} as never,
        );
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });

  describe('generate', () => {
    it('should throw 400 when text is missing', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      await expect(
        controller.generate(
          request as never,
          user as never,
          { voiceId: 'voice123' } as never,
        ),
      ).rejects.toThrow(HttpException);

      try {
        await controller.generate(
          request as never,
          user as never,
          { voiceId: 'voice123' } as never,
        );
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
    });

    it('should throw 400 when voiceId is missing', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      await expect(
        controller.generate(
          request as never,
          user as never,
          { text: 'Hello world' } as never,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should generate voice and return serialized result', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      const ingredientId = '507f191e810c19729de860ee';

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: { _id: ingredientId },
      });
      elevenLabsService.generateAndUploadAudio.mockResolvedValue({
        audioUrl: 'https://cdn.example.com/audio.mp3',
        duration: 5.5,
      });
      voicesService.patchAll.mockResolvedValue({});
      voicesService.findOne.mockResolvedValue({
        _id: ingredientId,
        status: 'generated',
        url: 'https://cdn.example.com/audio.mp3',
      });

      const result = await controller.generate(
        request as never,
        user as never,
        {
          text: 'Hello world',
          voiceId: 'voice123',
        } as never,
      );

      expect(result).toBeDefined();
      expect(elevenLabsService.generateAndUploadAudio).toHaveBeenCalledWith(
        'voice123',
        'Hello world',
        ingredientId.toString(),
        expect.any(String),
        expect.any(String),
      );
      expect(voicesService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({ OR: expect.any(Array) }),
        {
          duration: 5.5,
          status: 'generated',
          url: 'https://cdn.example.com/audio.mp3',
        },
      );
    });

    it('should mark ingredient as failed when generation errors', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      const ingredientId = '507f191e810c19729de860ee';

      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: { _id: ingredientId },
      });
      elevenLabsService.generateAndUploadAudio.mockRejectedValue(
        new Error('ElevenLabs API error'),
      );
      voicesService.patchAll.mockResolvedValue({});

      await expect(
        controller.generate(
          request as never,
          user as never,
          {
            text: 'Hello world',
            voiceId: 'voice123',
          } as never,
        ),
      ).rejects.toThrow(HttpException);

      expect(voicesService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({ OR: expect.any(Array) }),
        { status: 'failed' },
      );
    });
  });

  describe('cloneVoice', () => {
    it('should throw 400 when neither file nor audioUrl is provided', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      await expect(
        controller.cloneVoice(
          request as never,
          user as never,
          { name: 'My Voice' } as never,
          undefined,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 400 for unsupported provider', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      await expect(
        controller.cloneVoice(
          request as never,
          user as never,
          {
            audioUrl: 'https://example.com/audio.mp3',
            name: 'My Voice',
            provider: 'unsupported_provider',
          } as never,
          undefined,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('writes voiceProvider (not provider) when cloning via ElevenLabs', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      const ingredientId = '507f191e810c19729de860ee';

      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'test-key' });
      elevenLabsService.cloneVoice.mockResolvedValue({ voiceId: 'el_cloned' });
      sharedService.saveDocuments.mockResolvedValue({
        ingredientData: { _id: ingredientId },
      });
      voicesService.patchAll.mockResolvedValue({});
      voicesService.findOne.mockResolvedValue({
        _id: ingredientId,
        isCloned: true,
      });
      notificationsService.publishAssetStatus.mockResolvedValue(undefined);

      await controller.cloneVoice(
        request as never,
        user as never,
        {
          audioUrl: 'https://example.com/audio.mp3',
          name: 'My Voice',
          provider: VoiceProvider.ELEVENLABS,
        } as never,
        undefined,
      );

      expect(voicesService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({ OR: expect.any(Array) }),
        expect.objectContaining({ voiceProvider: VoiceProvider.ELEVENLABS }),
      );
    });
  });

  describe('findClonedVoices', () => {
    it('should return cloned voices for the user', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      voicesService.findAll.mockResolvedValue({
        docs: [{ _id: '507f191e810c19729de860ee', isCloned: true }],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      });

      const result = await controller.findClonedVoices(
        request as never,
        user as never,
        {} as never,
      );
      expect(result).toBeDefined();
      expect(voicesService.findAll).toHaveBeenCalled();
    });

    it('scopes cloned voice listing to organizationId (not organization)', async () => {
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({ organization: organizationId });
      const request = createMockRequest();
      voicesService.findAll.mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });

      await controller.findClonedVoices(
        request as never,
        user as never,
        {} as never,
      );

      const [query] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(query.where).toMatchObject({
        isCloned: true,
        isDeleted: false,
        organizationId,
      });
      // Old Mongo discriminator must not be present
      expect(query.where.type).toBeUndefined();
    });

    it('should throw 500 when findClonedVoices fails', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      voicesService.findAll.mockRejectedValue(new Error('DB error'));

      await expect(
        controller.findClonedVoices(
          request as never,
          user as never,
          {} as never,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deleteClonedVoice', () => {
    it('should throw 400 for invalid voice ID', async () => {
      const user = createMockUser();
      const request = createMockRequest();

      await expect(
        controller.deleteClonedVoice(
          request as never,
          user as never,
          'invalid-id',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw not found when voice does not exist', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      voicesService.findOne.mockResolvedValue(null);

      await expect(
        controller.deleteClonedVoice(
          request as never,
          user as never,
          '507f191e810c19729de860ee',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should soft-delete a cloned voice and delete from provider', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      const voiceId = '507f191e810c19729de860ee';
      const voice = {
        _id: voiceId,
        externalVoiceId: 'el_voice_123',
        isCloned: true,
        voiceProvider: VoiceProvider.ELEVENLABS,
      };

      voicesService.findOne.mockResolvedValue(voice);
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'test-key' });
      elevenLabsService.deleteVoice.mockResolvedValue(undefined);
      voicesService.patchAll.mockResolvedValue({});

      const result = await controller.deleteClonedVoice(
        request as never,
        user as never,
        voiceId,
      );

      expect(result).toBeDefined();
      expect(elevenLabsService.deleteVoice).toHaveBeenCalledWith(
        'el_voice_123',
        'test-key',
      );
      expect(voicesService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({ OR: expect.any(Array) }),
        { isDeleted: true },
      );
    });
  });
});
