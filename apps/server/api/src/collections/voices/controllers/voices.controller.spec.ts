import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  AssetScope,
  IngredientCategory,
  VoiceProvider,
} from '@genfeedai/enums';
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
      brand: '507f191e810c19729de860ee'.toHexString(),
      organization: '507f191e810c19729de860ee'.toHexString(),
      user: '507f191e810c19729de860ee'.toHexString(),
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
        docs: [{ _id: '507f191e810c19729de860ee', type: 'voice' }],
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

    it('builds a tenant-scoped aggregate for canonical voice listing', async () => {
      const brandId = '507f191e810c19729de860ee';
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({
        brand: brandId.toHexString(),
        organization: organizationId.toHexString(),
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

      const [aggregate] = voicesService.findAll.mock.calls[0] ?? [];
      expect(aggregate).toBeInstanceOf(Array);
      expect(aggregate[0]).toEqual({
        $match: {
          $or: [
            {
              voiceSource: 'catalog',
            },
            {
              $or: [
                { isCloned: true },
                { voiceSource: { $exists: false } },
                { voiceSource: { $in: ['cloned', 'generated'] } },
              ],
              brand: brandId,
              organization: organizationId,
            },
          ],
          category: IngredientCategory.VOICE,
          isDeleted: false,
          provider: {
            $in: [
              VoiceProvider.ELEVENLABS,
              VoiceProvider.HEYGEN,
              VoiceProvider.GENFEED_AI,
            ],
          },
          status: {
            $in: ['draft', 'uploaded', 'completed'],
          },
        },
      });
      expect(aggregate.at(-1)).toEqual({
        $sort: {
          createdAt: -1,
        },
      });
    });

    it('ignores tenant override query params and scopes to Clerk metadata', async () => {
      const brandId = '507f191e810c19729de860ee';
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({
        brand: brandId.toHexString(),
        organization: organizationId.toHexString(),
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
          brand: '507f191e810c19729de860ee'.toHexString(),
          organization: '507f191e810c19729de860ee'.toHexString(),
        } as never,
        request as never,
        user as never,
      );

      const [aggregate] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(aggregate[0]).toEqual({
        $match: {
          $or: [
            {
              voiceSource: 'catalog',
            },
            {
              $or: [
                { isCloned: true },
                { voiceSource: { $exists: false } },
                { voiceSource: { $in: ['cloned', 'generated'] } },
              ],
              brand: brandId,
              organization: organizationId,
            },
          ],
          category: IngredientCategory.VOICE,
          isDeleted: false,
          provider: {
            $in: [
              VoiceProvider.ELEVENLABS,
              VoiceProvider.HEYGEN,
              VoiceProvider.GENFEED_AI,
            ],
          },
          status: {
            $in: ['draft', 'uploaded', 'completed'],
          },
        },
      });
    });

    it('loads all matching voices for superadmin without tenant ownership filter', async () => {
      const user = createMockUser({ isSuperAdmin: true });
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
        { voiceSource: ['catalog'] } as never,
        request as never,
        user as never,
      );

      const [aggregate] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(aggregate[0]).toEqual({
        $match: {
          category: IngredientCategory.VOICE,
          isDeleted: false,
          provider: {
            $in: [
              VoiceProvider.ELEVENLABS,
              VoiceProvider.HEYGEN,
              VoiceProvider.GENFEED_AI,
            ],
          },
          status: {
            $in: ['draft', 'uploaded', 'completed'],
          },
          voiceSource: {
            $in: ['catalog'],
          },
        },
      });
    });

    it('applies provider, source, search, scope, and activation filters to the aggregate', async () => {
      const brandId = '507f191e810c19729de860ee';
      const organizationId = '507f191e810c19729de860ee';
      const user = createMockUser({
        brand: brandId.toHexString(),
        organization: organizationId.toHexString(),
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
          scope: AssetScope.BRAND,
          search: 'radio',
          voiceSource: ['catalog', 'cloned'],
        } as never,
        request as never,
        user as never,
      );

      const [aggregate] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(aggregate[0]).toEqual({
        $match: {
          $or: [
            {
              scope: AssetScope.BRAND,
              voiceSource: 'catalog',
            },
            {
              $or: [
                { isCloned: true },
                { voiceSource: { $exists: false } },
                { voiceSource: { $in: ['cloned', 'generated'] } },
              ],
              brand: brandId,
              organization: organizationId,
            },
          ],
          category: IngredientCategory.VOICE,
          isActive: {
            $ne: false,
          },
          isDeleted: false,
          provider: {
            $in: [VoiceProvider.GENFEED_AI, VoiceProvider.HEYGEN],
          },
          status: {
            $in: ['draft', 'uploaded', 'completed'],
          },
          voiceSource: {
            $in: ['catalog', 'cloned'],
          },
        },
      });
      expect(aggregate[3]).toEqual({
        $match: {
          $or: [
            {
              'metadata.label': {
                $options: 'i',
                $regex: 'radio',
              },
            },
            {
              externalVoiceId: {
                $options: 'i',
                $regex: 'radio',
              },
            },
            {
              provider: {
                $options: 'i',
                $regex: 'radio',
              },
            },
          ],
        },
      });
    });

    it('treats missing isActive as active when filtering active voices', async () => {
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
        { isActive: true } as never,
        request as never,
        user as never,
      );

      const [aggregate] = voicesService.findAll.mock.calls.at(-1) ?? [];
      expect(aggregate[0]).toEqual({
        $match: {
          $or: [
            {
              voiceSource: 'catalog',
            },
            {
              $or: [
                { isCloned: true },
                { voiceSource: { $exists: false } },
                { voiceSource: { $in: ['cloned', 'generated'] } },
              ],
              brand: expect.any(Types.ObjectId),
              organization: expect.any(Types.ObjectId),
            },
          ],
          category: IngredientCategory.VOICE,
          isActive: {
            $ne: false,
          },
          isDeleted: false,
          provider: {
            $in: [
              VoiceProvider.ELEVENLABS,
              VoiceProvider.HEYGEN,
              VoiceProvider.GENFEED_AI,
            ],
          },
          status: {
            $in: ['draft', 'uploaded', 'completed'],
          },
        },
      });
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
        type: 'voice',
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
        { _id: ingredientId },
        {
          $set: {
            duration: 5.5,
            status: 'generated',
            url: 'https://cdn.example.com/audio.mp3',
          },
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
        { _id: ingredientId },
        { $set: { status: 'failed' } },
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
  });

  describe('findClonedVoices', () => {
    it('should return cloned voices for the user', async () => {
      const user = createMockUser();
      const request = createMockRequest();
      voicesService.findAll.mockResolvedValue({
        docs: [
          { _id: '507f191e810c19729de860ee', isCloned: true, type: 'voice' },
        ],
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
          '507f191e810c19729de860ee'.toHexString(),
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
        provider: 'elevenlabs',
        type: 'voice',
      };

      voicesService.findOne.mockResolvedValue(voice);
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'test-key' });
      elevenLabsService.deleteVoice.mockResolvedValue(undefined);
      voicesService.patchAll.mockResolvedValue({});

      const result = await controller.deleteClonedVoice(
        request as never,
        user as never,
        voiceId.toHexString(),
      );

      expect(result).toBeDefined();
      expect(elevenLabsService.deleteVoice).toHaveBeenCalledWith(
        'el_voice_123',
        'test-key',
      );
      expect(voicesService.patchAll).toHaveBeenCalledWith(
        { _id: voiceId },
        { $set: { isDeleted: true } },
      );
    });
  });
});
