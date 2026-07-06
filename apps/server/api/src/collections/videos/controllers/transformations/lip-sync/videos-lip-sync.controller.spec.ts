vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439013',
    user: '507f1f77bcf86cd799439012',
  })),
}));

vi.mock('@api/helpers/utils/websocket/websocket.util', () => ({
  WebSocketPaths: {
    video: vi.fn((id: string) => `/ws/videos/${id}`),
  },
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn(() => 'createLipSyncVideo'),
  },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosLipSyncController } from '@api/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller';
import { CreateLipSyncDto } from '@api/collections/videos/dto/create-lip-sync.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('VideosLipSyncController', () => {
  let controller: VideosLipSyncController;

  const mockReq = {} as Request;

  const mockUser = {
    id: 'user_authProvider_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439014',
      organization: '507f1f77bcf86cd799439013',
      user: '507f1f77bcf86cd799439012',
    },
  } as unknown as User;

  const mockImageIngredient = {
    brand: '507f1f77bcf86cd799439014',
    category: IngredientCategory.IMAGE,
    id: '507f1f77bcf86cd799439001',
    organization: '507f1f77bcf86cd799439013',
    status: IngredientStatus.GENERATED,
  };

  const mockAudioIngredient = {
    category: IngredientCategory.AUDIO,
    id: '507f1f77bcf86cd799439002',
    organization: '507f1f77bcf86cd799439013',
    status: IngredientStatus.GENERATED,
  };

  const mockIngredientData = {
    id: '507f1f77bcf86cd799439040',
  };

  const mockMetadataData = {
    id: '507f1f77bcf86cd799439050',
  };

  const mockDto: CreateLipSyncDto = {
    parent: '507f1f77bcf86cd799439001',
    voice: '507f1f77bcf86cd799439002',
  };

  let byokService: { resolveApiKey: ReturnType<typeof vi.fn> };
  let failedGenerationService: {
    handleFailedVideoGeneration: ReturnType<typeof vi.fn>;
  };
  let heygenService: { generatePhotoAvatarVideo: ReturnType<typeof vi.fn> };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let sharedService: { saveDocuments: ReturnType<typeof vi.fn> };
  let websocketService: {
    publishFileProcessing: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    byokService = { resolveApiKey: vi.fn().mockResolvedValue(null) };
    failedGenerationService = {
      handleFailedVideoGeneration: vi.fn().mockResolvedValue(undefined),
    };
    heygenService = {
      generatePhotoAvatarVideo: vi
        .fn()
        .mockResolvedValue('heygen-video-id-abc'),
    };
    ingredientsService = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(mockImageIngredient)
        .mockResolvedValueOnce(mockAudioIngredient),
    };
    metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    sharedService = {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: mockIngredientData,
        metadataData: mockMetadataData,
      }),
    };
    websocketService = {
      publishFileProcessing: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosLipSyncController],
      providers: [
        { provide: ByokService, useValue: byokService },
        // CreditsInterceptor is now bound to the handler (@UseInterceptors); Nest
        // instantiates it at module compile, so its queue dependency must resolve.
        // It never runs here — controller methods are invoked directly.
        {
          provide: CreditDeductionQueueService,
          useValue: { queueByokUsage: vi.fn(), queueDeduction: vi.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), ingredientsEndpoint: 'http://localhost' },
        },
        {
          provide: FailedGenerationService,
          useValue: failedGenerationService,
        },
        {
          provide: HeyGenService,
          useValue: heygenService,
        },
        { provide: IngredientsService, useValue: ingredientsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: MetadataService, useValue: metadataService },
        { provide: SharedService, useValue: sharedService },
        {
          provide: VideosService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        {
          provide: NotificationsPublisherService,
          useValue: websocketService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosLipSyncController>(VideosLipSyncController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('charges a fixed 1-credit @Credits config (no modelKey) so CreditsInterceptor deducts a flat 1', () => {
    // Locks the #1354 fix: the route must charge a fixed amount via the
    // standard guard+interceptor path, NOT a modelKey (which would re-introduce
    // the models-table lookup) and NOT a manual inline deduction.
    const reflector = new Reflector();
    const config = reflector.get<{ amount?: number; modelKey?: string }>(
      CREDITS_KEY,
      controller.createLipSyncVideo,
    );

    expect(config).toBeDefined();
    expect(config.amount).toBe(1);
    expect(config.modelKey).toBeUndefined();
  });

  describe('createLipSyncVideo', () => {
    describe('happy path', () => {
      it('should return ingredient data on successful generation', async () => {
        const result = await controller.createLipSyncVideo(
          mockReq,
          mockUser,
          mockDto,
        );

        expect(result).toEqual(mockIngredientData);
      });

      it('should call HeyGen with resolved photo and audio URLs', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
          mockIngredientData.id,
          `http://localhost/images/${mockDto.parent}`,
          `http://localhost/audios/${mockDto.voice}`,
          '507f1f77bcf86cd799439013',
          '507f1f77bcf86cd799439012',
          undefined, // no BYOK key
        );
      });

      it('should update metadata with HeyGen video ID', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(metadataService.patch).toHaveBeenCalledWith(
          mockMetadataData.id,
          expect.objectContaining({ externalId: 'heygen-video-id-abc' }),
        );
      });

      it('should publish websocket processing status', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(websocketService.publishFileProcessing).toHaveBeenCalled();
      });

      it('should resolve BYOK key when available', async () => {
        byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-key-xyz' });

        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'byok-key-xyz',
        );
      });

      it('should build audio URL with "videos" path for video audio ingredient', async () => {
        const videoAudioIngredient = {
          ...mockAudioIngredient,
          category: IngredientCategory.VIDEO,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(videoAudioIngredient);

        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          `http://localhost/videos/${mockDto.voice}`,
          expect.any(String),
          expect.any(String),
          undefined,
        );
      });
    });

    describe('image ingredient validation', () => {
      it('should throw 404 when image ingredient is not found', async () => {
        ingredientsService.findOne.mockReset().mockResolvedValue(null);

        await expect(
          controller.createLipSyncVideo(mockReq, mockUser, mockDto),
        ).rejects.toThrow(HttpException);
      });

      it('should return 404 status for missing image ingredient', async () => {
        ingredientsService.findOne.mockReset().mockResolvedValue(null);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(404);
        }
      });

      it('should throw 400 when image ingredient is not IMAGE category', async () => {
        const nonImageIngredient = {
          ...mockImageIngredient,
          category: IngredientCategory.VIDEO,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(nonImageIngredient)
          .mockResolvedValueOnce(mockAudioIngredient);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });

      it('should throw 400 when image ingredient has PROCESSING status', async () => {
        const processingImage = {
          ...mockImageIngredient,
          status: IngredientStatus.PROCESSING,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(processingImage)
          .mockResolvedValueOnce(mockAudioIngredient);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });

      it('should accept VALIDATED status for image ingredient', async () => {
        const validatedImage = {
          ...mockImageIngredient,
          status: IngredientStatus.VALIDATED,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(validatedImage)
          .mockResolvedValueOnce(mockAudioIngredient);

        const result = await controller.createLipSyncVideo(
          mockReq,
          mockUser,
          mockDto,
        );

        expect(result).toBeDefined();
      });
    });

    describe('audio ingredient validation', () => {
      it('should throw 404 when audio ingredient is not found', async () => {
        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(null);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(404);
        }
      });

      it('should throw 400 when audio ingredient has invalid category', async () => {
        const invalidAudio = {
          ...mockAudioIngredient,
          category: IngredientCategory.IMAGE,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(invalidAudio);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });

      it('should throw 400 when audio ingredient is not in a usable state', async () => {
        const processingAudio = {
          ...mockAudioIngredient,
          status: IngredientStatus.PROCESSING,
        };

        ingredientsService.findOne
          .mockReset()
          .mockResolvedValueOnce(mockImageIngredient)
          .mockResolvedValueOnce(processingAudio);

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(400);
        }
      });
    });

    describe('generation failure', () => {
      it('should call failedGenerationService when HeyGen throws', async () => {
        heygenService.generatePhotoAvatarVideo.mockRejectedValue(
          new Error('HeyGen API error'),
        );

        await expect(
          controller.createLipSyncVideo(mockReq, mockUser, mockDto),
        ).rejects.toThrow(HttpException);

        expect(
          failedGenerationService.handleFailedVideoGeneration,
        ).toHaveBeenCalled();
      });

      it('should rethrow HttpException as-is', async () => {
        const originalException = new HttpException('Forbidden', 403);
        heygenService.generatePhotoAvatarVideo.mockRejectedValue(
          originalException,
        );

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBe(originalException);
          expect((err as HttpException).getStatus()).toBe(403);
        }
      });

      it('should wrap unknown errors in 500 HttpException', async () => {
        heygenService.generatePhotoAvatarVideo.mockRejectedValue(
          new Error('unexpected failure'),
        );

        try {
          await controller.createLipSyncVideo(mockReq, mockUser, mockDto);
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          expect((err as HttpException).getStatus()).toBe(500);
        }
      });
    });
  });
});
