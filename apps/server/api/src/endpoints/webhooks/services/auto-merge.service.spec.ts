import { AutoMergeService } from '@api/endpoints/webhooks/services/auto-merge.service';
import {
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AutoMergeService', () => {
  let service: AutoMergeService;
  let activitiesService: Record<string, ReturnType<typeof vi.fn>>;
  let ingredientsService: {
    findAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let metadataService: { create: ReturnType<typeof vi.fn> };
  let usersService: Record<string, ReturnType<typeof vi.fn>>;
  let filesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let fileQueueService: {
    add: ReturnType<typeof vi.fn>;
    getJobs: ReturnType<typeof vi.fn>;
  };
  let websocketService: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockObjectId = 'test-object-id';

  beforeEach(() => {
    activitiesService = {
      create: vi.fn().mockResolvedValue({ _id: mockObjectId }),
      patch: vi.fn(),
    };
    ingredientsService = {
      create: vi.fn().mockResolvedValue({ _id: mockObjectId }),
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    metadataService = {
      create: vi.fn().mockResolvedValue({ _id: 'meta-1' }),
      patch: vi.fn(),
    };
    usersService = {
      findOne: vi.fn(),
    };
    filesClientService = {
      uploadToS3: vi.fn(),
    };
    fileQueueService = {
      processVideo: vi.fn(),
      waitForJob: vi.fn(),
    };
    websocketService = {
      publishBackgroundTaskUpdate: vi.fn(),
      publishMediaFailed: vi.fn(),
      publishVideoComplete: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new AutoMergeService(
      activitiesService,
      ingredientsService,
      metadataService,
      usersService,
      filesClientService,
      fileQueueService,
      websocketService,
      loggerService,
    );
  });

  describe('triggerAutoMergeIfReady', () => {
    it('should skip non-video ingredients', () => {
      const ingredient = {
        _id: mockObjectId,
        category: IngredientCategory.IMAGE,
      } as unknown as IngredientEntity;

      // triggerAutoMergeIfReady runs in background via setImmediate
      // We test the async implementation directly
      service.triggerAutoMergeIfReady(ingredient);

      // Since it's fire-and-forget, we just verify no crash
      expect(loggerService.error).not.toHaveBeenCalled();
    });

    it('should skip videos without groupId', () => {
      const ingredient = {
        _id: mockObjectId,
        category: IngredientCategory.VIDEO,
      } as unknown as IngredientEntity;

      service.triggerAutoMergeIfReady(ingredient);

      expect(loggerService.error).not.toHaveBeenCalled();
    });
  });

  describe('internal merge logic (via triggerAutoMergeIfReady)', () => {
    it('should skip when not all videos are completed', async () => {
      const groupId = 'group-1';
      const videos = [
        { _id: 'test-object-id', status: IngredientStatus.GENERATED },
        { _id: 'test-object-id', status: IngredientStatus.PROCESSING },
      ];

      ingredientsService.findAll.mockResolvedValue({ docs: videos });

      // Access private method for testing
      const ingredient = {
        _id: mockObjectId,
        category: IngredientCategory.VIDEO,
        groupId,
        isMergeEnabled: true,
        user: { _id: 'test-object-id', clerkId: 'clerk_abc' },
      } as unknown as IngredientEntity;

      // Use private method access for testing
      await (service as any).triggerAutoMergeAsync(ingredient);

      expect(ingredientsService.create).not.toHaveBeenCalled();
    });

    it('should skip when merge already exists', async () => {
      const groupId = 'group-1';
      const videos = [
        { _id: 'test-object-id', status: IngredientStatus.GENERATED },
        { _id: 'test-object-id', status: IngredientStatus.GENERATED },
      ];

      ingredientsService.findAll.mockResolvedValue({ docs: videos });
      ingredientsService.findOne.mockResolvedValue({
        _id: 'test-object-id',
        transformations: [TransformationCategory.MERGED],
      });

      const ingredient = {
        _id: mockObjectId,
        category: IngredientCategory.VIDEO,
        groupId,
        isMergeEnabled: true,
        user: { _id: 'test-object-id', clerkId: 'clerk_abc' },
      } as unknown as IngredientEntity;

      await (service as any).triggerAutoMergeAsync(ingredient);

      expect(metadataService.create).not.toHaveBeenCalled();
    });

    it('should skip when no userId available', async () => {
      const groupId = 'group-1';
      const videos = [
        { _id: 'test-object-id', status: IngredientStatus.GENERATED },
      ];

      ingredientsService.findAll.mockResolvedValue({ docs: videos });
      ingredientsService.findOne.mockResolvedValue(null);

      const ingredient = {
        _id: mockObjectId,
        category: IngredientCategory.VIDEO,
        groupId,
        isMergeEnabled: true,
        user: undefined,
      } as unknown as IngredientEntity;

      await (service as any).triggerAutoMergeAsync(ingredient);

      expect(loggerService.warn).toHaveBeenCalled();
      expect(metadataService.create).not.toHaveBeenCalled();
    });
  });
});
