import { RedisService } from '@libs/redis/redis.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { WebSocketService } from '@libs/websockets/websockets.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('WebSocketService', () => {
  let service: WebSocketService;
  let redisService: Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketService,
        {
          provide: RedisService,
          useValue: {
            publish: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebSocketService>(WebSocketService);
    redisService = module.get(RedisService);

    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishVideoProgress', () => {
    it('should publish video progress with default room', async () => {
      const path = '/path/to/video.mp4';
      const progress = { frame: 1000, percentage: 50 };
      const userId = 'user123';

      await service.publishVideoProgress(path, progress, userId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'video-progress',
        JSON.stringify({
          path,
          progress,
          room: getUserRoomName(userId),
          userId,
        }),
      );
    });

    it('should publish video progress with custom room', async () => {
      const path = '/path/to/video.mp4';
      const progress = { frame: 1500, percentage: 75 };
      const userId = 'user123';
      const room = 'custom-room';

      await service.publishVideoProgress(path, progress, userId, room);

      expect(redisService.publish).toHaveBeenCalledWith(
        'video-progress',
        JSON.stringify({
          path,
          progress,
          room,
          userId,
        }),
      );
    });
  });

  describe('publishVideoComplete', () => {
    it('should publish video completion with default room', async () => {
      const path = '/path/to/video.mp4';
      const result = { duration: 120, size: 1024000 };
      const userId = 'user123';

      await service.publishVideoComplete(path, result, userId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'video-complete',
        JSON.stringify({
          path,
          result,
          room: getUserRoomName(userId),
          userId,
        }),
      );
    });

    it('should publish video completion with custom room', async () => {
      const path = '/path/to/video.mp4';
      const result = { duration: 120, size: 1024000 };
      const userId = 'user123';
      const room = 'custom-room';

      await service.publishVideoComplete(path, result, userId, room);

      expect(redisService.publish).toHaveBeenCalledWith(
        'video-complete',
        JSON.stringify({
          path,
          result,
          room,
          userId,
        }),
      );
    });
  });

  describe('publishMediaFailed', () => {
    it('should publish media failure with default room', async () => {
      const path = '/path/to/media';
      const error = 'Generation failed';
      const userId = 'user123';

      await service.publishMediaFailed(path, error, userId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'media-failed',
        JSON.stringify({
          error,
          path,
          room: getUserRoomName(userId),
          userId,
        }),
      );
    });

    it('should publish media failure with custom room', async () => {
      const path = '/path/to/media';
      const error = 'Generation failed';
      const userId = 'user123';
      const room = 'custom-room';

      await service.publishMediaFailed(path, error, userId, room);

      expect(redisService.publish).toHaveBeenCalledWith(
        'media-failed',
        JSON.stringify({
          error,
          path,
          room,
          userId,
        }),
      );
    });
  });

  describe('publishNotification', () => {
    it('should publish notification with userId and organizationId', async () => {
      const notification = { message: 'Test notification', type: 'info' };
      const userId = 'user123';
      const organizationId = 'org123';

      await service.publishNotification(notification, userId, organizationId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'notifications',
        JSON.stringify({
          notification,
          organizationId,
          userId,
        }),
      );
    });

    it('should publish notification without userId and organizationId', async () => {
      const notification = { message: 'Test notification', type: 'info' };

      await service.publishNotification(notification);

      expect(redisService.publish).toHaveBeenCalledWith(
        'notifications',
        JSON.stringify({
          notification,
          organizationId: undefined,
          userId: undefined,
        }),
      );
    });
  });

  describe('publishIngredientStatus', () => {
    it('should publish ingredient status update', async () => {
      const ingredientId = 'ingredient123';
      const status = 'completed';
      const userId = 'user123';
      const metadata = { progress: 100 };

      await service.publishIngredientStatus(
        ingredientId,
        status,
        userId,
        metadata,
      );

      expect(redisService.publish).toHaveBeenCalledWith(
        'ingredient-status',
        JSON.stringify({
          ingredientId,
          metadata,
          status,
          userId,
        }),
      );
    });

    it('should publish ingredient status without metadata', async () => {
      const ingredientId = 'ingredient123';
      const status = 'processing';
      const userId = 'user123';

      await service.publishIngredientStatus(ingredientId, status, userId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'ingredient-status',
        JSON.stringify({
          ingredientId,
          metadata: undefined,
          status,
          userId,
        }),
      );
    });
  });

  describe('publishPostStatus', () => {
    it('should publish post status update', async () => {
      const postId = 'publication123';
      const status = 'published';
      const userId = 'user123';
      const metadata = { platform: 'youtube' };

      await service.publishPostStatus(postId, status, userId, metadata);

      expect(redisService.publish).toHaveBeenCalledWith(
        'post-status',
        JSON.stringify({
          metadata,
          postId,
          status,
          userId,
        }),
      );
    });

    it('should publish post status without metadata', async () => {
      const postId = 'publication123';
      const status = 'draft';
      const userId = 'user123';

      await service.publishPostStatus(postId, status, userId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'post-status',
        JSON.stringify({
          metadata: undefined,
          postId,
          status,
          userId,
        }),
      );
    });
  });

  describe('publishTrainingStatus', () => {
    it('should publish training status update', async () => {
      const trainingId = 'training123';
      const status = 'completed';
      const userId = 'user123';
      const progress = { epoch: 10, loss: 0.1 };

      await service.publishTrainingStatus(trainingId, status, userId, progress);

      expect(redisService.publish).toHaveBeenCalledWith(
        'training-status',
        JSON.stringify({
          progress,
          status,
          trainingId,
          userId,
        }),
      );
    });

    it('should publish training status without progress', async () => {
      const trainingId = 'training123';
      const status = 'started';
      const userId = 'user123';

      await service.publishTrainingStatus(trainingId, status, userId);

      expect(redisService.publish).toHaveBeenCalledWith(
        'training-status',
        JSON.stringify({
          progress: undefined,
          status,
          trainingId,
          userId,
        }),
      );
    });
  });

  describe('publishFileProcessing', () => {
    it('should publish file processing update', async () => {
      const jobId = 'job123';
      const type = 'video';
      const status = 'processing';
      const userId = 'user123';
      const ingredientId = 'ingredient123';
      const progress = { percentage: 50 };

      await service.publishFileProcessing(
        jobId,
        type,
        status,
        userId,
        ingredientId,
        progress,
      );

      expect(redisService.publish).toHaveBeenCalledWith(
        'file-processing',
        JSON.stringify({
          ingredientId,
          jobId,
          progress,
          status,
          type,
          userId,
        }),
      );
    });

    it('should publish file processing without progress', async () => {
      const jobId = 'job123';
      const type = 'image';
      const status = 'queued';
      const userId = 'user123';
      const ingredientId = 'ingredient123';

      await service.publishFileProcessing(
        jobId,
        type,
        status,
        userId,
        ingredientId,
      );

      expect(redisService.publish).toHaveBeenCalledWith(
        'file-processing',
        JSON.stringify({
          ingredientId,
          jobId,
          progress: undefined,
          status,
          type,
          userId,
        }),
      );
    });
  });
});
