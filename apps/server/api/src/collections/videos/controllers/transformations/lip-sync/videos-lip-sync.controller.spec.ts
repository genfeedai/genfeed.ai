vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
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

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosLipSyncController } from '@api/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller';
import { CreateLipSyncDto } from '@api/collections/videos/dto/create-lip-sync.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('VideosLipSyncController', () => {
  let controller: VideosLipSyncController;

  const mockReq = {} as Request;

  const mockUser = {
    id: 'user_clerk_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439014',
      organization: '507f1f77bcf86cd799439013',
      user: '507f1f77bcf86cd799439012',
    },
  } as unknown as User;

  const mockImageIngredient = {
    _id: '507f1f77bcf86cd799439001',
    brand: '507f1f77bcf86cd799439014',
    category: IngredientCategory.IMAGE,
    organization: '507f1f77bcf86cd799439013',
    status: IngredientStatus.GENERATED,
  };

  const mockAudioIngredient = {
    _id: '507f1f77bcf86cd799439002',
    category: IngredientCategory.AUDIO,
    organization: '507f1f77bcf86cd799439013',
    status: IngredientStatus.GENERATED,
  };

  const mockIngredientData = {
    _id: '507f1f77bcf86cd799439040',
  };

  const mockMetadataData = {
    _id: '507f1f77bcf86cd799439050',
  };

  const mockDto: CreateLipSyncDto = {
    parent: '507f1f77bcf86cd799439001',
    voice: '507f1f77bcf86cd799439002',
  };

  let byokService: { resolveApiKey: ReturnType<typeof vi.fn> };
  let creditsUtilsService: {
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
  };
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
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
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
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), ingredientsEndpoint: 'http://localhost' },
        },
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsService,
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
      .overrideGuard(ClerkGuard)
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
          mockIngredientData._id,
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
          mockMetadataData._id,
          expect.objectContaining({ externalId: 'heygen-video-id-abc' }),
        );
      });

      it('should deduct credits after successful generation', async () => {
        await controller.createLipSyncVideo(mockReq, mockUser, mockDto);

        expect(
          creditsUtilsService.deductCreditsFromOrganization,
        ).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439013',
          '507f1f77bcf86cd799439012',
          1,
          expect.stringContaining('heygen'),
          expect.any(String),
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
