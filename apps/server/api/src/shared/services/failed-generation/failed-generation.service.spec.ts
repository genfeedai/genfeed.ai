import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  type FailedGenerationOptions,
  FailedGenerationService,
} from '@api/shared/services/failed-generation/failed-generation.service';
import {
  ActivityKey,
  ActivitySource,
  IngredientStatus,
} from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('FailedGenerationService', () => {
  let service: FailedGenerationService;
  let activitiesService: vi.Mocked<ActivitiesService>;
  let websocketService: vi.Mocked<NotificationsPublisherService>;

  const mockIngredientId = '507f1f77bcf86cd799439011';
  const mockUserId = '507f1f77bcf86cd799439012';
  const mockOrganizationId = '507f1f77bcf86cd799439013';
  const mockWebsocketUrl = 'ws://localhost:3003';

  const mockService = {
    patch: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FailedGenerationService,
        {
          provide: ActivitiesService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            emit: vi.fn(),
            publishMediaFailed: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FailedGenerationService>(FailedGenerationService);
    activitiesService = module.get(ActivitiesService);
    websocketService = module.get(NotificationsPublisherService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleFailedGeneration', () => {
    it('should update ingredient status to FAILED', async () => {
      const options: FailedGenerationOptions = {
        ingredientId: mockIngredientId,
        websocketUrl: mockWebsocketUrl,
      };

      mockService.patch.mockResolvedValue({});

      await service.handleFailedGeneration(mockService, options);

      expect(mockService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });
    });

    it('should create activity when metadata provided', async () => {
      const options: FailedGenerationOptions = {
        activityMetadata: {
          key: ActivityKey.VIDEO_FAILED,
          organization: mockOrganizationId,
          source: ActivitySource.SCRIPT,
          user: mockUserId,
          value: mockIngredientId,
        },
        ingredientId: mockIngredientId,
        websocketUrl: mockWebsocketUrl,
      };

      mockService.patch.mockResolvedValue({});
      activitiesService.create.mockResolvedValue({} as never);

      await service.handleFailedGeneration(mockService, options);

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.VIDEO_FAILED,
          organization: expect.any(Types.ObjectId),
          source: ActivitySource.SCRIPT,
          user: expect.any(Types.ObjectId),
        }),
      );
    });

    it('should not create activity when metadata not provided', async () => {
      const options: FailedGenerationOptions = {
        ingredientId: mockIngredientId,
        websocketUrl: mockWebsocketUrl,
      };

      mockService.patch.mockResolvedValue({});

      await service.handleFailedGeneration(mockService, options);

      expect(activitiesService.create).not.toHaveBeenCalled();
    });

    it('should use publishMediaFailed when specified', async () => {
      const options: FailedGenerationOptions = {
        ingredientId: mockIngredientId,
        room: 'test-room',
        userId: mockUserId,
        websocketMessage: 'Custom error message',
        websocketMethod: 'publishMediaFailed',
        websocketUrl: mockWebsocketUrl,
      };

      mockService.patch.mockResolvedValue({});
      websocketService.publishMediaFailed.mockResolvedValue(undefined);

      await service.handleFailedGeneration(mockService, options);

      expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
        mockWebsocketUrl,
        'Custom error message',
        mockUserId,
        'test-room',
      );
      expect(websocketService.emit).not.toHaveBeenCalled();
    });

    it('should use emit by default with delay', async () => {
      vi.useFakeTimers();

      const options: FailedGenerationOptions = {
        delay: 500,
        ingredientId: mockIngredientId,
        websocketUrl: mockWebsocketUrl,
      };

      mockService.patch.mockResolvedValue({});

      await service.handleFailedGeneration(mockService, options);

      expect(websocketService.emit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(websocketService.emit).toHaveBeenCalledWith(mockWebsocketUrl, {
        result: null,
        status: IngredientStatus.FAILED,
      });

      vi.useRealTimers();
    });

    it('should use custom status when provided', async () => {
      const options: FailedGenerationOptions = {
        ingredientId: mockIngredientId,
        status: IngredientStatus.ARCHIVED,
        websocketUrl: mockWebsocketUrl,
      };

      mockService.patch.mockResolvedValue({});

      await service.handleFailedGeneration(mockService, options);

      expect(mockService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.ARCHIVED,
      });
    });
  });

  describe('handleFailedVoiceGeneration', () => {
    it('should handle failed voice generation', async () => {
      const voicesService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      vi.useFakeTimers();

      await service.handleFailedVoiceGeneration(
        voicesService,
        mockIngredientId,
        mockWebsocketUrl,
      );

      expect(voicesService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });

      vi.useRealTimers();
    });
  });

  describe('handleFailedAvatarGeneration', () => {
    it('should handle failed avatar generation', async () => {
      const avatarsService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      vi.useFakeTimers();

      await service.handleFailedAvatarGeneration(
        avatarsService,
        mockIngredientId,
        mockWebsocketUrl,
      );

      expect(avatarsService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });

      vi.useRealTimers();
    });
  });

  describe('handleFailedVideoGeneration', () => {
    it('should handle failed video generation', async () => {
      const videosService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      websocketService.publishMediaFailed.mockResolvedValue(undefined);

      await service.handleFailedVideoGeneration(
        videosService,
        mockIngredientId,
        mockWebsocketUrl,
        mockUserId,
        'test-room',
      );

      expect(videosService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });

      expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
        mockWebsocketUrl,
        'Processing failed',
        mockUserId,
        'test-room',
      );
    });
  });

  describe('handleFailedImageGeneration', () => {
    it('should handle failed image generation with metadata', async () => {
      const imagesService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      websocketService.publishMediaFailed.mockResolvedValue(undefined);

      await service.handleFailedImageGeneration(
        imagesService,
        mockIngredientId,
        mockWebsocketUrl,
        {
          organization: mockOrganizationId,
          user: mockUserId,
        },
        'test-room',
      );

      expect(imagesService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });

      expect(activitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: ActivityKey.IMAGE_FAILED,
          source: ActivitySource.SCRIPT,
        }),
      );
    });

    it('should publish the provider error message when supplied', async () => {
      const imagesService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      websocketService.publishMediaFailed.mockResolvedValue(undefined);

      await service.handleFailedImageGeneration(
        imagesService,
        mockIngredientId,
        mockWebsocketUrl,
        {
          organization: mockOrganizationId,
          user: mockUserId,
        },
        'test-room',
        'gen4_image_turbo requires at least one reference image',
      );

      expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
        mockWebsocketUrl,
        'gen4_image_turbo requires at least one reference image',
        mockUserId,
        'test-room',
      );
    });

    it('should handle failed image generation without metadata', async () => {
      const imagesService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      websocketService.publishMediaFailed.mockResolvedValue(undefined);

      await service.handleFailedImageGeneration(
        imagesService,
        mockIngredientId,
        mockWebsocketUrl,
      );

      expect(imagesService.patch).toHaveBeenCalled();
      expect(activitiesService.create).not.toHaveBeenCalled();
    });
  });

  describe('handleFailedMusicGeneration', () => {
    it('should handle failed music generation', async () => {
      const musicsService = {
        patch: vi.fn().mockResolvedValue({}),
      };

      websocketService.publishMediaFailed.mockResolvedValue(undefined);

      await service.handleFailedMusicGeneration(
        musicsService,
        mockIngredientId,
        mockWebsocketUrl,
        mockUserId,
        'test-room',
      );

      expect(musicsService.patch).toHaveBeenCalledWith(mockIngredientId, {
        status: IngredientStatus.FAILED,
      });

      expect(websocketService.publishMediaFailed).toHaveBeenCalledWith(
        mockWebsocketUrl,
        'Generation failed',
        mockUserId,
        'test-room',
      );
    });
  });
});
