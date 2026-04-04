import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('VideoCompletionService', () => {
  let service: VideoCompletionService;
  let redisService: vi.Mocked<RedisService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;

  const mockIngredientId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439013');

  async function waitForAsyncHandler(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoCompletionService,
        {
          provide: RedisService,
          useValue: {
            publish: vi.fn(),
            subscribe: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            patch: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VideoCompletionService>(VideoCompletionService);
    redisService = module.get(RedisService);
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should subscribe to video completion channel', async () => {
      await service.onModuleInit();

      expect(redisService.subscribe).toHaveBeenCalledWith(
        'video-processing-complete',
        expect.any(Function),
      );
    });
  });

  describe('handleVideoCompletion', () => {
    it('should update ingredient status to COMPLETED on successful processing', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        result: {
          metadata: {
            duration: 10.5,
            height: 1080,
            width: 1920,
          },
          publicUrl: 'https://example.com/video.mp4',
          s3Key: 'ingredients/videos/507f1f77bcf86cd799439011',
        },
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.findOne.mockResolvedValue({
        _id: mockIngredientId,
        metadata: new Types.ObjectId('507f1f77bcf86cd799439099'),
      } as never);
      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      // Get the callback function passed to subscribe
      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      // Call the callback with mock data
      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          s3Key: mockData.result.s3Key,
          status: IngredientStatus.GENERATED,
        },
      );
      expect(metadataService.patch).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
        {
          duration: 10.5,
          height: 1080,
          width: 1920,
        },
      );
    });

    it('should update ingredient status to FAILED on processing error', async () => {
      const mockData = {
        error: 'Processing failed due to invalid format',
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'failed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.FAILED,
      });

      // Get the callback function passed to subscribe
      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      // Call the callback with mock data
      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          status: IngredientStatus.FAILED,
        },
      );
    });

    it('should handle completion with s3Key result', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        result: {
          s3Key: 'ingredients/videos/507f1f77bcf86cd799439011',
        },
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.findOne.mockResolvedValue({
        _id: mockIngredientId,
        metadata: new Types.ObjectId('507f1f77bcf86cd799439099'),
      } as never);
      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          s3Key: 'ingredients/videos/507f1f77bcf86cd799439011',
          status: IngredientStatus.GENERATED,
        },
      );
      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('should handle completion without result data', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledWith(
        mockData.ingredientId,
        {
          status: IngredientStatus.GENERATED,
        },
      );
      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('should persist top-level duration and dimensions metadata when present', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        result: {
          dimensions: {
            height: 1920,
            width: 1080,
          },
          duration: 24.2,
        },
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.findOne.mockResolvedValue({
        _id: mockIngredientId,
        metadata: new Types.ObjectId('507f1f77bcf86cd799439099'),
      } as never);
      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
        status: IngredientStatus.GENERATED,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData);
      await waitForAsyncHandler();

      expect(metadataService.patch).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
        {
          duration: 24.2,
          height: 1920,
          width: 1080,
        },
      );
    });

    it('should handle errors during ingredient update', async () => {
      const mockData = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      const error = new Error('Database update failed');
      ingredientsService.patch.mockRejectedValue(error);

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      // The callback is fire-and-forget (void) — errors are caught internally
      expect(() => subscribeCallback(mockData)).not.toThrow();
      await waitForAsyncHandler();
      expect(ingredientsService.patch).toHaveBeenCalled();
    });

    it('should handle multiple completion events', async () => {
      const mockData1 = {
        ingredientId: mockIngredientId.toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      const mockData2 = {
        error: 'Processing error',
        ingredientId: new Types.ObjectId().toString(),
        organizationId: mockOrganizationId.toString(),
        status: 'failed',
        timestamp: new Date().toISOString(),
        userId: mockUserId.toString(),
      };

      ingredientsService.patch.mockResolvedValue({
        _id: mockIngredientId,
      });

      await service.onModuleInit();
      const subscribeCallback = (redisService.subscribe as vi.Mock).mock
        .calls[0][1];

      await subscribeCallback(mockData1);
      await subscribeCallback(mockData2);
      await waitForAsyncHandler();

      expect(ingredientsService.patch).toHaveBeenCalledTimes(2);
      expect(ingredientsService.patch).toHaveBeenNthCalledWith(
        1,
        mockData1.ingredientId,
        {
          status: IngredientStatus.GENERATED,
        },
      );
      expect(ingredientsService.patch).toHaveBeenNthCalledWith(
        2,
        mockData2.ingredientId,
        {
          status: IngredientStatus.FAILED,
        },
      );
    });
  });
});
